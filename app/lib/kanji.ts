import type { ReadingDisplaySets, Stroke, StrokeNumber } from "./types";
import type { KanjiInfo } from "./types";

const ENDING_GUIDANCE_FLAGS = {
  detailGrades: new Set([1, 2, 3, 4, 5, 6]),
  printGrades: new Set([1, 2, 3, 4, 5, 6]),
  traceGrades: new Set([1, 2, 3, 4, 5, 6]),
};

const STROKE_ENDING_BY_TYPE = new Map([
  ["㇒", "はらい"],
  ["㇏", "はらい"],
  ["㇀", "はらい"],
  ["㇚", "はね"],
  ["㇟", "はね"],
  ["㇖", "はね"],
  ["㇆", "はね"],
  ["㇗", "はね"],
  ["㇓", "はね"],
  ["㇜", "はね"],
  ["㇙", "はね"],
  ["㇛", "はね"],
  ["㇁", "はね"],
  ["㇂", "はね"],
  ["㇉", "はね"],
  ["㇈", "はね"],
  ["㇇", "はね"],
  ["㇐", "とめ"],
  ["㇑", "とめ"],
  ["㇔", "とめ"],
  ["㇕", "とめ"],
  ["㇄", "とめ"],
  ["㇃", "とめ"],
  ["㇋", "とめ"],
  ["㇞", "とめ"],
]);

export function kanjiToHex(char: string) {
  return char.codePointAt(0)?.toString(16).padStart(5, "0") ?? "";
}

function parseSVG(svgText: string) {
  return svgText;
}

function readAttribute(tagText: string, attributeName: string) {
  const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tagText.match(new RegExp(`(?:^|[\\s<])${escapedName}\\s*=\\s*["']([^"']*)["']`));
  return match?.[1] || "";
}

export function parseStrokes(svgText: string): Stroke[] {
  const matches = parseSVG(svgText).match(/<path\b[^>]*>/g) || [];

  return matches
    .map((tagText) => ({
      d: readAttribute(tagText, "d"),
      id: readAttribute(tagText, "id"),
      type: readAttribute(tagText, "kvg:type"),
    }))
    .filter((stroke) => Boolean(stroke.d));
}

export function parseStrokeNumbers(svgText: string): StrokeNumber[] {
  const matches = parseSVG(svgText).match(/<text\b[^>]*transform=["'][^"']*["'][^>]*>[^<]+<\/text>/g) || [];

  return matches.map((tagText) => {
    const transform = readAttribute(tagText, "transform");
    const matrixMatch = transform.match(/matrix\([^)]*\s+([\d.]+)\s+([\d.]+)\)/);
    const textMatch = tagText.match(/>([^<]+)<\/text>/);

    return {
      num: textMatch?.[1] || "",
      x: matrixMatch ? Number.parseFloat(matrixMatch[1]) : 0,
      y: matrixMatch ? Number.parseFloat(matrixMatch[2]) : 0,
    };
  });
}

export function getViewBox(svgText: string) {
  const svgMatch = parseSVG(svgText).match(/<svg\b[^>]*viewBox=["']([^"']+)["']/i);
  return svgMatch?.[1] || "0 0 109 109";
}

export function parseViewBox(viewBox: string) {
  const [x = 0, y = 0, width = 109, height = 109] = viewBox.split(/\s+/).map(Number);
  return { x, y, width, height };
}

export function gradeLabel(grade: number) {
  return `${grade}ねんせい`;
}

export function getReadingDisplaySets(
  info: KanjiInfo | null | undefined,
  {
    onLimit = 2,
    kunLimit = 3,
    totalLimit = null,
  }: {
    onLimit?: number;
    kunLimit?: number;
    totalLimit?: number | null;
  } = {},
): ReadingDisplaySets {
  if (!info) {
    return { on: [], kun: [] };
  }

  const prioritizeReadings = (readings: string[], type: "on" | "kun", limit: number) => {
    const seenRoots = new Set<string>();
    const selected: string[] = [];

    readings.forEach((reading) => {
      if (!reading || selected.length >= limit) return;

      const cleaned = reading.replace(/^[\-]/, "").replace(/\./g, "");
      const root = type === "kun" ? cleaned.slice(0, Math.min(cleaned.length, 3)) : cleaned;
      if (seenRoots.has(root)) return;

      seenRoots.add(root);
      selected.push(reading);
    });

    return selected;
  };

  const readingSets = {
    on: prioritizeReadings(info.on_readings || [], "on", onLimit),
    kun: prioritizeReadings(info.kun_readings || [], "kun", kunLimit),
  };

  if (totalLimit !== null) {
    while (readingSets.on.length + readingSets.kun.length > totalLimit) {
      if (readingSets.kun.length >= readingSets.on.length && readingSets.kun.length > 0) {
        readingSets.kun.pop();
      } else if (readingSets.on.length > 0) {
        readingSets.on.pop();
      } else {
        break;
      }
    }
  }

  return readingSets;
}

export function shouldShowEndingGuidance(
  surface: "trace" | "detail" | "print",
  grade: number | null | undefined,
) {
  if (!grade) return false;
  if (surface === "trace") return ENDING_GUIDANCE_FLAGS.traceGrades.has(grade);
  if (surface === "detail") return ENDING_GUIDANCE_FLAGS.detailGrades.has(grade);
  return ENDING_GUIDANCE_FLAGS.printGrades.has(grade);
}

function normalizeStrokeTypePart(part: string) {
  return String(part || "").replace(/[a-z]+$/i, "");
}

export function inferStrokeEnding(stroke: Stroke | null | undefined) {
  const rawType = stroke?.type || "";
  if (!rawType) return null;

  const endings = [...new Set(
    rawType
      .split("/")
      .map(normalizeStrokeTypePart)
      .map((type) => STROKE_ENDING_BY_TYPE.get(type))
      .filter(Boolean),
  )];

  return endings.length === 1 ? endings[0] : null;
}

export function getStrokeEndingLabel(
  strokes: Stroke[],
  index: number,
  surface: "trace" | "detail" | "print",
  grade: number | null | undefined,
) {
  if (!shouldShowEndingGuidance(surface, grade)) return "";
  return inferStrokeEnding(strokes[index]) || "";
}
