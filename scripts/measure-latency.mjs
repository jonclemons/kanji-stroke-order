import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const sampleKanji = "交";
const sampleHex = "04ea4";
const iterations = Number(process.env.MEASURE_RUNS || 3);
const mode = process.env.MEASURE_MODE || "upstream";
const localBase = process.env.MEASURE_LOCAL_BASE || "http://127.0.0.1:8001";

const targetSets = {
  upstream: [
    { label: "kanji_info", url: `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(sampleKanji)}` },
    { label: "kanji_words", url: `https://kanjiapi.dev/v1/words/${encodeURIComponent(sampleKanji)}` },
    { label: "kanjivg_svg", url: `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${sampleHex}.svg` },
    { label: "grade_2_list", url: "https://kanjiapi.dev/v1/kanji/grade-2" },
  ],
  local: [
    { label: "kanji_info", url: `${localBase}/data/v1/info/${sampleHex}.json` },
    { label: "kanji_words", url: `${localBase}/data/v1/words/${sampleHex}.json` },
    { label: "kanjivg_svg", url: `${localBase}/data/v1/svg/${sampleHex}.svg` },
    { label: "grade_2_list", url: `${localBase}/data/v1/grades/grade-2.json` },
  ],
};

async function timeCurl(url) {
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "-o",
    "/dev/null",
    "-w",
    "%{time_total}",
    url,
  ]);

  const totalSeconds = Number(stdout.trim());
  if (Number.isNaN(totalSeconds)) {
    throw new Error(`Could not parse curl output for ${url}: ${stdout}`);
  }

  return totalSeconds * 1000;
}

function summarize(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  const avg = total / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    avgMs: Number(avg.toFixed(1)),
    minMs: Number(min.toFixed(1)),
    maxMs: Number(max.toFixed(1)),
  };
}

async function main() {
  const targets = targetSets[mode];
  if (!targets) {
    throw new Error(`Unknown MEASURE_MODE: ${mode}`);
  }

  const rows = [];
  for (const target of targets) {
    const samples = [];
    for (let index = 0; index < iterations; index += 1) {
      samples.push(await timeCurl(target.url));
    }
    rows.push({
      label: target.label,
      url: target.url,
      samplesMs: samples.map((sample) => Number(sample.toFixed(1))),
      ...summarize(samples),
    });
  }

  process.stdout.write(`${JSON.stringify({
    mode,
    sampleKanji,
    iterations,
    rows,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
