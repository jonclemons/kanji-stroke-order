import type { DrawSearchEntry } from "./drawSearch";
import type { RasterBounds } from "./drawing";

export type RecognitionInput = {
  bounds: RasterBounds;
  height: 64;
  values: Float32Array;
  width: 64;
};

export type RecognitionCandidate = {
  entry?: DrawSearchEntry;
  kanji: string;
  rank: number;
  score: number;
  source: "local-tflite";
};

export type RecognitionProvider = {
  id: "local-tflite";
  recognize(input: RecognitionInput, limit: number): Promise<RecognitionCandidate[]>;
};
