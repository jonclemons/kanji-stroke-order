import type { Context } from "hono";
import type { AppEnv } from "../env";
import { DATA_VERSION } from "../../src/version.js";
import { getViewBox, kanjiToHex, parseStrokeNumbers, parseStrokes } from "./kanji";
import type { KanjiDetailData, KanjiInfo, KanjiWord } from "./types";

const jsonCache = new Map<string, Promise<unknown | null>>();
const textCache = new Map<string, Promise<string | null>>();
const knownKanjiCache = new Map<number, Promise<Set<string>>>();
const filteredWordsCache = new Map<string, Promise<KanjiWord[]>>();

type AppContext = Context<AppEnv>;

function versionedAssetPath(path: string) {
  return `/data/${DATA_VERSION}/${path}`;
}

async function fetchAsset(c: AppContext, path: string) {
  const request = new Request(new URL(path, c.req.url).toString(), {
    method: "GET",
    headers: {
      accept: c.req.header("accept") || "*/*",
    },
  });

  return c.env.ASSETS.fetch(request);
}

async function fetchJson<T>(c: AppContext, path: string): Promise<T | null> {
  const cacheKey = `json:${path}`;
  const cached = jsonCache.get(cacheKey);
  if (cached) return (await cached) as T | null;

  const promise = (async () => {
    const response = await fetchAsset(c, path);
    if (!response.ok) return null;
    return (await response.json()) as T;
  })();

  jsonCache.set(cacheKey, promise);
  return (await promise) as T | null;
}

async function fetchText(c: AppContext, path: string): Promise<string | null> {
  const cacheKey = `text:${path}`;
  const cached = textCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const response = await fetchAsset(c, path);
    if (!response.ok) return null;
    return response.text();
  })();

  textCache.set(cacheKey, promise);
  return promise;
}

export function parseGrade(rawGrade: string | undefined) {
  const grade = Number.parseInt(rawGrade || "", 10);
  if (!Number.isInteger(grade) || grade < 1 || grade > 6) return null;
  return grade;
}

export function parseKanjiParam(rawKanji: string | undefined) {
  if (!rawKanji) return "";
  try {
    return decodeURIComponent(rawKanji);
  } catch {
    return rawKanji;
  }
}

export async function loadGradeKanji(c: AppContext, grade: number) {
  return (await fetchJson<string[]>(c, versionedAssetPath(`grades/grade-${grade}.json`))) || [];
}

export async function loadKanjiInfo(c: AppContext, kanji: string) {
  return fetchJson<KanjiInfo>(c, versionedAssetPath(`info/${kanjiToHex(kanji)}.json`));
}

export async function loadKanjiWords(c: AppContext, kanji: string) {
  return (await fetchJson<KanjiWord[]>(c, versionedAssetPath(`words/${kanjiToHex(kanji)}.json`))) || [];
}

export async function loadKanjiSvg(c: AppContext, kanji: string) {
  return fetchText(c, versionedAssetPath(`svg/${kanjiToHex(kanji)}.svg`));
}

export async function loadKnownKanjiForGrade(c: AppContext, targetGrade: number): Promise<Set<string>> {
  const cached = knownKanjiCache.get(targetGrade);
  if (cached) return cached;

  const promise = (async () => {
    const known = targetGrade > 1 ? new Set(await loadKnownKanjiForGrade(c, targetGrade - 1)) : new Set<string>();
    const currentGradeKanji = await loadGradeKanji(c, targetGrade);
    currentGradeKanji.forEach((kanji) => known.add(kanji));
    return known;
  })();

  knownKanjiCache.set(targetGrade, promise);
  return promise;
}

export async function getGradeAppropriateWords(
  c: AppContext,
  kanji: string,
  words: KanjiWord[],
  targetGrade: number,
) {
  const cacheKey = `${kanji}:${targetGrade}`;
  const cached = filteredWordsCache.get(cacheKey);
  if (cached) return cached;

  const promise = (async () => {
    const knownKanji = await loadKnownKanjiForGrade(c, targetGrade);

    const filtered = words.filter((word) => {
      if (!word.variants?.length || !word.meanings?.length) return false;

      const written = word.variants[0]?.written;
      if (!written) return false;
      if (written.length > 3) return false;

      for (const character of written) {
        const code = character.codePointAt(0) || 0;
        if (code >= 0x4e00 && code <= 0x9fff && !knownKanji.has(character)) {
          return false;
        }
      }

      return true;
    });

    const seen = new Set<string>();
    const unique: KanjiWord[] = [];

    filtered.forEach((word) => {
      const written = word.variants?.[0]?.written;
      if (!written || seen.has(written)) return;
      seen.add(written);
      unique.push(word);
    });

    return unique.slice(0, 10);
  })();

  filteredWordsCache.set(cacheKey, promise);
  return promise;
}

export async function loadKanjiDetailData(
  c: AppContext,
  kanji: string,
  requestedGrade: number | null,
): Promise<KanjiDetailData | null> {
  const [info, svgText, words] = await Promise.all([
    loadKanjiInfo(c, kanji),
    loadKanjiSvg(c, kanji),
    loadKanjiWords(c, kanji),
  ]);

  if (!info || !svgText) return null;

  const canonicalGrade = info.grade && info.grade >= 1 && info.grade <= 6
    ? info.grade
    : requestedGrade;

  if (!canonicalGrade) return null;

  const [filteredWords, gradeKanji] = await Promise.all([
    getGradeAppropriateWords(c, kanji, words, canonicalGrade),
    loadGradeKanji(c, canonicalGrade),
  ]);

  return {
    canonicalGrade,
    filteredWords,
    gradeKanji,
    info,
    strokeNumbers: parseStrokeNumbers(svgText),
    strokes: parseStrokes(svgText),
    svgText,
    viewBox: getViewBox(svgText),
    words,
  };
}
