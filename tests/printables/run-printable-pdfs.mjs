#!/usr/bin/env node
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_RANDOM_SEED = "printable-worksheets";

const baseUrl = new URL(readArg("url") || DEFAULT_BASE_URL);
const chromePath = process.env.CHROME_PATH || DEFAULT_CHROME_PATH;
const saveDir = readArg("save-dir");
const suiteId = readArg("suite") || "kanji-practice";
const perCaseTimeoutMs = Number.parseInt(readArg("timeout-ms") || "", 10);
const progressEvery = Number.parseInt(readArg("progress-every") || "", 10);
const saveLimit = Number.parseInt(readArg("save-limit") || "", 10);
const saveAll = process.argv.includes("--save-all");
const selection = readSelection();

function readArg(name) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) || "";
}

function readSelection() {
  const samples = (readArg("samples") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const randomSize = Number.parseInt(readArg("random") || readArg("sample-size") || "", 10);

  if (Number.isFinite(randomSize) && randomSize > 0) {
    return {
      mode: "random",
      sampleSize: randomSize,
      seed: readArg("seed") || DEFAULT_RANDOM_SEED,
    };
  }

  if (samples.length > 0 || process.argv.includes("--only-samples")) {
    return {
      mode: "samples",
      samples,
    };
  }

  return { mode: "full" };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const userDataDir = await mkdtemp(join(tmpdir(), "kanji-printable-tests-"));
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

function savedSampleLimit() {
  if (!saveDir) return 0;
  if (saveAll) return Number.POSITIVE_INFINITY;
  if (Number.isFinite(saveLimit) && saveLimit > 0) return saveLimit;
  if (selection.mode === "full") return 6;
  return Number.POSITIVE_INFINITY;
}

const browserPrintableTest = String.raw`
async (options) => {
  const [{ runPrintablePdfSuite }, { createKanjiPracticePrintableSuite }] = await Promise.all([
    import("/tests/printables/printable-suite.ts"),
    import("/tests/printables/kanji-practice-suite.ts"),
  ]);
  const suites = {
    "kanji-practice": createKanjiPracticePrintableSuite(),
  };
  const suite = suites[options.suiteId];

  if (!suite) {
    throw new Error("Unknown printable suite: " + options.suiteId);
  }

  return runPrintablePdfSuite(suite, {
    onProgress(progress) {
      console.log(JSON.stringify(progress));
    },
    perCaseTimeoutMs: options.perCaseTimeoutMs,
    progressEvery: options.progressEvery,
    saveLimit: options.saveLimit,
    saveSamples: options.saveSamples,
    selection: options.selection,
  });
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
    expression: `(${browserPrintableTest})(${JSON.stringify({
      saveLimit: savedSampleLimit(),
      saveSamples: Boolean(saveDir),
      selection,
      suiteId,
      perCaseTimeoutMs: Number.isFinite(perCaseTimeoutMs) && perCaseTimeoutMs > 0 ? perCaseTimeoutMs : undefined,
      progressEvery: Number.isFinite(progressEvery) && progressEvery > 0 ? progressEvery : undefined,
    })})`,
    returnByValue: true,
  }, sessionId);

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Printable PDF test failed in the browser.");
  }

  const testResult = result.result.value;

  if (saveDir && testResult.savedSamples?.length) {
    await mkdir(saveDir, { recursive: true });
    testResult.savedSamples = await Promise.all(testResult.savedSamples.map(async (sample) => {
      const filename = safeFilename(sample.filename || `${sample.title}.pdf`);
      const path = join(saveDir, filename);
      await writeFile(path, Buffer.from(sample.base64, "base64"));
      return {
        bytes: sample.bytes,
        filename,
        id: sample.id,
        label: sample.label,
        metadata: sample.metadata,
        path,
        title: sample.title,
      };
    }));
  }

  console.log(JSON.stringify(testResult, null, 2));

  if (testResult.failureCount > 0) {
    process.exitCode = 1;
  }
} finally {
  cdp.close();
  await chrome.cleanup();
}

function safeFilename(filename) {
  return filename.replace(/[/:]/g, "-");
}
