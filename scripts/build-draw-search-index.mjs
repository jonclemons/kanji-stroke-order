#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_VERSION } from "../src/version.js";

const root = process.cwd();
const dataDir = path.join(root, "public", "data", DATA_VERSION);
const manifestPath = path.join(dataDir, "manifest.json");
const outputPath = path.join(dataDir, "search-index.json");
const educationGrades = [1, 2, 3, 4, 5, 6];

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entries = [];

for (const grade of educationGrades) {
  const kanjiList = manifest.grades?.[String(grade)] || [];

  for (const kanji of kanjiList) {
    const hex = kanji.codePointAt(0)?.toString(16).padStart(5, "0");
    const infoPath = path.join(dataDir, "info", `${hex}.json`);
    const info = JSON.parse(await readFile(infoPath, "utf8"));

    entries.push({
      kanji,
      grade: info.grade || grade,
      meanings: info.meanings || [],
      kunReadings: info.kun_readings || [],
      onReadings: info.on_readings || [],
      strokeCount: info.stroke_count ?? null,
    });
  }
}

await writeFile(outputPath, `${JSON.stringify(entries)}\n`);
console.log(`Wrote ${entries.length} entries to public/data/${DATA_VERSION}/search-index.json`);
