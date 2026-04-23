export type KanjiInfo = {
  grade?: number | null;
  kanji: string;
  kun_readings?: string[];
  meanings?: string[];
  notes?: string[];
  on_readings?: string[];
  stroke_count?: number;
  unicode?: string;
};

export type KanjiWordMeaning = {
  glosses?: string[];
};

export type KanjiWordVariant = {
  priorities?: string[];
  pronounced?: string;
  written?: string;
};

export type KanjiWord = {
  meanings?: KanjiWordMeaning[];
  variants?: KanjiWordVariant[];
};

export type Stroke = {
  d: string;
  id: string;
  type: string;
};

export type StrokeNumber = {
  num: string;
  x: number;
  y: number;
};

export type ReadingDisplaySets = {
  on: string[];
  kun: string[];
};

export type KanjiDetailData = {
  canonicalGrade: number | null;
  filteredWords: KanjiWord[];
  gradeKanji: string[];
  info: KanjiInfo;
  strokeNumbers: StrokeNumber[];
  strokes: Stroke[];
  svgText: string;
  viewBox: string;
  words: KanjiWord[];
};
