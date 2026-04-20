import fs from "node:fs/promises";
import path from "node:path";

const VERSION = process.env.MIRROR_VERSION || "v1";
const OUTPUT_ROOT = path.join(process.cwd(), "public", "data", VERSION);
const CONCURRENCY = Number(process.env.MIRROR_CONCURRENCY || 8);
const GRADES = [1, 2, 3, 4, 5, 6];

function kanjiToHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchWithRetry(url, { parse = "json", retries = 3 } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return parse === "text" ? response.text() : response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch ${url}: ${lastError?.message || "unknown error"}`);
}

async function runPool(items, worker, limit) {
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
}

async function main() {
  const gradeDir = path.join(OUTPUT_ROOT, "grades");
  const infoDir = path.join(OUTPUT_ROOT, "info");
  const wordsDir = path.join(OUTPUT_ROOT, "words");
  const svgDir = path.join(OUTPUT_ROOT, "svg");

  await Promise.all([
    ensureDir(gradeDir),
    ensureDir(infoDir),
    ensureDir(wordsDir),
    ensureDir(svgDir),
  ]);

  const allKanji = new Set();
  const gradeIndex = {};

  for (const grade of GRADES) {
    const gradeList = await fetchWithRetry(`https://kanjiapi.dev/v1/kanji/grade-${grade}`);
    gradeIndex[grade] = gradeList;
    gradeList.forEach((kanji) => allKanji.add(kanji));
    await writeJson(path.join(gradeDir, `grade-${grade}.json`), gradeList);
    console.log(`mirrored grade ${grade}: ${gradeList.length} kanji`);
  }

  const kanjiList = Array.from(allKanji);
  let completed = 0;
  const failures = [];

  await runPool(kanjiList, async (kanji) => {
    const hex = kanjiToHex(kanji);
    try {
      const [info, words, svg] = await Promise.all([
        fetchWithRetry(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`),
        fetchWithRetry(`https://kanjiapi.dev/v1/words/${encodeURIComponent(kanji)}`),
        fetchWithRetry(`https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`, { parse: "text" }),
      ]);

      await Promise.all([
        writeJson(path.join(infoDir, `${hex}.json`), info),
        writeJson(path.join(wordsDir, `${hex}.json`), words),
        fs.writeFile(path.join(svgDir, `${hex}.svg`), svg, "utf8"),
      ]);
    } catch (error) {
      failures.push({ kanji, hex, error: error.message });
    } finally {
      completed += 1;
      if (completed % 50 === 0 || completed === kanjiList.length) {
        console.log(`mirrored ${completed}/${kanjiList.length}`);
      }
    }
  }, CONCURRENCY);

  const manifest = {
    version: VERSION,
    builtAt: new Date().toISOString(),
    gradeCount: GRADES.length,
    kanjiCount: kanjiList.length,
    grades: gradeIndex,
    failures,
    sources: {
      kanjiApi: "https://kanjiapi.dev",
      kanjiVg: "https://github.com/KanjiVG/kanjivg",
    },
  };

  await writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest);

  if (failures.length) {
    console.error(`mirror completed with ${failures.length} failures`);
    process.exitCode = 1;
    return;
  }

  console.log(`mirror completed successfully for ${kanjiList.length} kanji`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
