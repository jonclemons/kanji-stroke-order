import { parseStrokeNumbers, parseStrokes, kanjiToHex } from "../../app/lib/kanji";
import { buildPrintSheetSVG } from "../../app/lib/print";
import type { KanjiInfo } from "../../app/lib/types";
import { DATA_VERSION } from "../../src/version.js";
import type { PrintablePdfSuite, PrintableWorksheetCase } from "./printable-suite";

const GRADES = [1, 2, 3, 4, 5, 6];

export function createKanjiPracticePrintableSuite(): PrintablePdfSuite {
  return {
    id: "kanji-practice",
    name: "Kanji practice worksheets",
    async loadCases() {
      const gradeLists = await Promise.all(
        GRADES.map(async (grade) => ({
          grade,
          kanji: await fetchJson<string[]>(`/data/${DATA_VERSION}/grades/grade-${grade}.json`),
        })),
      );

      return gradeLists.flatMap(({ grade, kanji }) => kanji.map((char) => createKanjiWorksheetCase(grade, char)));
    },
  };
}

function createKanjiWorksheetCase(grade: number, kanji: string): PrintableWorksheetCase {
  return {
    filename: `${grade}年-${kanji}のれんしゅうシート.pdf`,
    id: `kanji-practice:${grade}:${kanji}`,
    label: kanji,
    metadata: { grade, kanji },
    async renderSvg() {
      const hex = kanjiToHex(kanji);
      const [info, sourceSvg] = await Promise.all([
        fetchJson<KanjiInfo>(`/data/${DATA_VERSION}/info/${hex}.json`),
        fetchText(`/data/${DATA_VERSION}/svg/${hex}.svg`),
      ]);

      return buildPrintSheetSVG({
        grade,
        info,
        strokeNumbers: parseStrokeNumbers(sourceSvg),
        strokes: parseStrokes(sourceSvg),
      });
    },
    sampleKeys: [
      kanji,
      `${grade}:${kanji}`,
      `${grade}年:${kanji}`,
      `${grade}年-${kanji}`,
    ],
    title: `${kanji}のれんしゅうシート`,
  };
}

async function fetchJson<T>(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }

  return response.json() as Promise<T>;
}

async function fetchText(path: string) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }

  return response.text();
}
