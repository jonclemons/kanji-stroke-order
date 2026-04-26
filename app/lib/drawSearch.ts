import type { KanjiInfo } from "./types";

export const EDUCATION_GRADES = [1, 2, 3, 4, 5, 6] as const;

export type EducationGrade = (typeof EDUCATION_GRADES)[number];

export type DrawSearchEntry = {
  kanji: string;
  grade: EducationGrade;
  meanings: string[];
  kunReadings: string[];
  onReadings: string[];
  strokeCount: number | null;
};

export function isEducationGrade(value: number | null | undefined): value is EducationGrade {
  return Number.isInteger(value) && EDUCATION_GRADES.includes(value as EducationGrade);
}

export function drawSearchEntryFromInfo(info: KanjiInfo): DrawSearchEntry | null {
  if (!isEducationGrade(info.grade)) return null;

  return {
    kanji: info.kanji,
    grade: info.grade,
    meanings: info.meanings || [],
    kunReadings: info.kun_readings || [],
    onReadings: info.on_readings || [],
    strokeCount: info.stroke_count ?? null,
  };
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "");
}

export function normalizeReadingText(value: string) {
  return normalizeSearchText(value)
    .replace(/[.・･\-−ー]/g, "")
    .replace(/[\u30a1-\u30f6]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function selectedGradeSet(grades: Iterable<number>) {
  return new Set([...grades].filter(isEducationGrade));
}

function gradeMatches(entry: DrawSearchEntry, grades: Iterable<number>) {
  const selected = selectedGradeSet(grades);
  return selected.size === 0 || selected.has(entry.grade);
}

export function matchesDrawSearchEntry(
  entry: DrawSearchEntry,
  query: string,
  grades: Iterable<number> = EDUCATION_GRADES,
) {
  if (!gradeMatches(entry, grades)) return false;

  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const readingQuery = normalizeReadingText(query);
  const gradeQueries = new Set([
    String(entry.grade),
    `${entry.grade}年`,
    `${entry.grade}ねん`,
    `${entry.grade}ねんせい`,
  ].map(normalizeSearchText));

  return (
    normalizeSearchText(entry.kanji).includes(normalizedQuery) ||
    gradeQueries.has(normalizedQuery) ||
    entry.meanings.some((meaning) => normalizeSearchText(meaning).includes(normalizedQuery)) ||
    entry.kunReadings.some((reading) => normalizeReadingText(reading).includes(readingQuery)) ||
    entry.onReadings.some((reading) => normalizeReadingText(reading).includes(readingQuery))
  );
}

export function rankDrawSearchEntry(entry: DrawSearchEntry, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const readingQuery = normalizeReadingText(query);
  if (!normalizedQuery) return entry.grade * 1000;

  if (normalizeSearchText(entry.kanji) === normalizedQuery) return 0;
  if (normalizeSearchText(entry.kanji).includes(normalizedQuery)) return 5;
  if (entry.kunReadings.some((reading) => normalizeReadingText(reading) === readingQuery)) return 20;
  if (entry.onReadings.some((reading) => normalizeReadingText(reading) === readingQuery)) return 25;
  if (entry.kunReadings.some((reading) => normalizeReadingText(reading).startsWith(readingQuery))) return 30;
  if (entry.onReadings.some((reading) => normalizeReadingText(reading).startsWith(readingQuery))) return 35;
  if (entry.meanings.some((meaning) => normalizeSearchText(meaning).startsWith(normalizedQuery))) return 45;
  if (entry.meanings.some((meaning) => normalizeSearchText(meaning).includes(normalizedQuery))) return 55;

  return 100;
}

export function searchDrawIndex(
  entries: DrawSearchEntry[],
  query: string,
  grades: Iterable<number> = EDUCATION_GRADES,
  limit = 40,
) {
  return entries
    .filter((entry) => matchesDrawSearchEntry(entry, query, grades))
    .map((entry) => ({ entry, rank: rankDrawSearchEntry(entry, query) }))
    .sort((a, b) => a.rank - b.rank || a.entry.grade - b.entry.grade || a.entry.kanji.localeCompare(b.entry.kanji, "ja"))
    .slice(0, limit)
    .map(({ entry }) => entry);
}
