#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const baseUrl = new URL(process.argv.find((arg) => arg.startsWith("--url="))?.slice("--url=".length) || DEFAULT_BASE_URL);
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
const sampleKanji = (readArg("samples") || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const saveDir = readArg("save-dir");
const onlySamples = process.argv.includes("--only-samples");

function readArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

async function waitForUrl(url, timeoutMs = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Keep waiting.
    }
    await delay(250);
  }

  throw new Error(`Could not reach ${url}. Start the local dev server first, for example: bun run dev`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createCdpClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { reject, resolve } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result || {});
      }
      return;
    }

    const callbacks = listeners.get(message.method);
    if (callbacks) {
      callbacks.forEach((callback) => callback(message.params || {}, message.sessionId));
    }
  });

  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        close: () => ws.close(),
        on(method, callback) {
          if (!listeners.has(method)) listeners.set(method, new Set());
          listeners.get(method).add(callback);
          return () => listeners.get(method)?.delete(callback);
        },
        send(method, params = {}, sessionId = undefined) {
          const id = nextId++;
          const message = { id, method, params };
          if (sessionId) message.sessionId = sessionId;

          return new Promise((resolveMessage, rejectMessage) => {
            pending.set(id, { reject: rejectMessage, resolve: resolveMessage });
            ws.send(JSON.stringify(message));
          });
        },
      });
    });
    ws.addEventListener("error", () => reject(new Error(`Could not connect to Chrome DevTools at ${wsUrl}`)));
  });
}

async function launchChrome() {
  const userDataDir = await mkdtemp(join(tmpdir(), "kanji-pdf-bench-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-default-browser-check",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank",
  ], {
    stdio: "ignore",
  });

  const activePortFile = join(userDataDir, "DevToolsActivePort");
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    try {
      const [port, browserPath] = (await readFile(activePortFile, "utf8")).trim().split("\n");
      return {
        async cleanup() {
          if (!chrome.killed) {
            chrome.kill();
          }
          if (chrome.exitCode === null && chrome.signalCode === null) {
            await Promise.race([once(chrome, "exit"), delay(2_000)]);
          }
          await removeDirectoryWithRetry(userDataDir);
        },
        wsUrl: `ws://127.0.0.1:${port}${browserPath}`,
      };
    } catch {
      await delay(100);
    }
  }

  chrome.kill();
  await removeDirectoryWithRetry(userDataDir);
  throw new Error("Chrome did not expose a DevTools port in time.");
}

async function removeDirectoryWithRetry(path) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(path, { force: true, maxRetries: 3, recursive: true, retryDelay: 150 });
      return;
    } catch (error) {
      lastError = error;
      await delay(150 * (attempt + 1));
    }
  }

  throw lastError;
}

function waitForEvent(cdp, method, predicate = () => true) {
  return new Promise((resolve) => {
    const off = cdp.on(method, (params, sessionId) => {
      if (!predicate(params, sessionId)) return;
      off();
      resolve(params);
    });
  });
}

const browserBenchmark = String.raw`
async (options) => {
  const [{ DATA_VERSION }, printModule, kanjiModule, pdfModule] = await Promise.all([
    import("/src/version.js"),
    import("/app/lib/print.ts"),
    import("/app/lib/kanji.ts"),
    import("/app/lib/print-pdf.ts"),
  ]);
  const { buildPrintSheetSVG } = printModule;
  const { kanjiToHex, parseStrokeNumbers, parseStrokes } = kanjiModule;
  const { generatePrintSheetPdfBlob } = pdfModule;

  function countPdfPages(bytes) {
    const chunks = [];
    for (let index = 0; index < bytes.length; index += 32768) {
      chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
    }
    const text = chunks.join("");
    return (text.match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
  }

  async function blobToBase64(blob) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("Could not read PDF blob."));
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(",") + 1);
  }

  async function fetchJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Failed to fetch " + path);
    return response.json();
  }

  async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("Failed to fetch " + path);
    return response.text();
  }

  const gradeLists = await Promise.all(
    [1, 2, 3, 4, 5, 6].map(async (grade) => ({
      grade,
      kanji: await fetchJson("/data/" + DATA_VERSION + "/grades/grade-" + grade + ".json"),
    })),
  );
  const allItems = gradeLists.flatMap(({ grade, kanji }) => kanji.map((char) => ({ grade, kanji: char })));
  const sampleSet = new Set(options.sampleKanji || []);
  const items = options.onlySamples && sampleSet.size > 0
    ? allItems.filter((item) => sampleSet.has(item.kanji))
    : allItems;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;";
  document.body.append(host);

  const failures = [];
  const savedSamples = [];
  const timings = [];
  const sizes = [];
  const startedAt = performance.now();

  for (let index = 0; index < items.length; index += 1) {
    const { grade, kanji } = items[index];
    const hex = kanjiToHex(kanji);
    const [info, sourceSvg] = await Promise.all([
      fetchJson("/data/" + DATA_VERSION + "/info/" + hex + ".json"),
      fetchText("/data/" + DATA_VERSION + "/svg/" + hex + ".svg"),
    ]);
    const sheetSvg = buildPrintSheetSVG({
      grade,
      info,
      strokeNumbers: parseStrokeNumbers(sourceSvg),
      strokes: parseStrokes(sourceSvg),
    });

    host.innerHTML = sheetSvg;
    const svg = host.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
      failures.push({ error: "missing generated sheet svg", grade, kanji });
      continue;
    }

    const itemStartedAt = performance.now();
    const blob = await generatePrintSheetPdfBlob(svg, kanji + "のれんしゅうシート");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const pageCount = countPdfPages(bytes);
    const durationMs = performance.now() - itemStartedAt;
    const shouldSaveSample = options.saveSamples && (
      sampleSet.has(kanji) ||
      (sampleSet.size === 0 && savedSamples.length < 6)
    );

    timings.push(durationMs);
    sizes.push(bytes.byteLength);
    if (pageCount !== 1) {
      failures.push({ bytes: bytes.byteLength, grade, kanji, pageCount });
    }

    if (shouldSaveSample) {
      savedSamples.push({
        base64: await blobToBase64(blob),
        bytes: bytes.byteLength,
        grade,
        kanji,
      });
    }

    host.innerHTML = "";
    if ((index + 1) % 50 === 0 || index + 1 === items.length) {
      console.log(JSON.stringify({ done: index + 1, total: items.length }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  host.remove();
  timings.sort((a, b) => a - b);
  sizes.sort((a, b) => a - b);

  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const percentile = (values, p) => values[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;

  return {
    averagePdfBytes: Math.round(sum(sizes) / sizes.length),
    averageMs: Math.round(sum(timings) / timings.length),
    count: items.length,
    failures: failures.slice(0, 20),
    failureCount: failures.length,
    maxPdfBytes: sizes.at(-1) || 0,
    maxMs: Math.round(timings.at(-1) || 0),
    medianPdfBytes: sizes[Math.floor(sizes.length / 2)] || 0,
    medianMs: Math.round(percentile(timings, 0.5)),
    minPdfBytes: sizes[0] || 0,
    minMs: Math.round(timings[0] || 0),
    p95Ms: Math.round(percentile(timings, 0.95)),
    savedSamples,
    totalMs: Math.round(performance.now() - startedAt),
  };
}
`;

await waitForUrl(baseUrl);

const chrome = await launchChrome();
const cdp = await createCdpClient(chrome.wsUrl);

try {
  const target = await cdp.send("Target.createTarget", { url: "about:blank" });
  const attached = await cdp.send("Target.attachToTarget", { flatten: true, targetId: target.targetId });
  const sessionId = attached.sessionId;

  cdp.on("Runtime.consoleAPICalled", (params) => {
    const text = params.args?.map((arg) => arg.value || arg.description || "").join(" ");
    if (text) console.error(text);
  });

  await cdp.send("Page.enable", {}, sessionId);
  await cdp.send("Runtime.enable", {}, sessionId);
  const loaded = waitForEvent(cdp, "Page.loadEventFired", (_params, eventSessionId) => eventSessionId === sessionId);
  await cdp.send("Page.navigate", { url: baseUrl.href }, sessionId);
  await loaded;

  const result = await cdp.send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(${browserBenchmark})(${JSON.stringify({
      onlySamples,
      sampleKanji,
      saveSamples: Boolean(saveDir),
    })})`,
    returnByValue: true,
  }, sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Benchmark failed in the browser.");
  }

  const benchmarkResult = result.result.value;
  if (saveDir && benchmarkResult.savedSamples?.length) {
    await mkdir(saveDir, { recursive: true });
    benchmarkResult.savedSamples = await Promise.all(benchmarkResult.savedSamples.map(async (sample) => {
      const filename = `${sample.grade}年-${sample.kanji}のれんしゅうシート.pdf`;
      const path = join(saveDir, filename);
      await writeFile(path, Buffer.from(sample.base64, "base64"));
      return {
        bytes: sample.bytes,
        grade: sample.grade,
        kanji: sample.kanji,
        path,
      };
    }));
  }

  console.log(JSON.stringify(benchmarkResult, null, 2));
} finally {
  cdp.close();
  await chrome.cleanup();
}
