import { describe, expect, it } from "vitest";
import { searchDrawIndex, type DrawSearchEntry } from "../../app/lib/drawSearch";

const entries: DrawSearchEntry[] = [
  {
    grade: 1,
    kanji: "学",
    kunReadings: ["まな.ぶ"],
    meanings: ["study", "learning"],
    onReadings: ["ガク"],
    strokeCount: 8,
  },
  {
    grade: 1,
    kanji: "四",
    kunReadings: ["よ", "よ.つ"],
    meanings: ["four"],
    onReadings: ["シ"],
    strokeCount: 5,
  },
  {
    grade: 2,
    kanji: "海",
    kunReadings: ["うみ"],
    meanings: ["sea"],
    onReadings: ["カイ"],
    strokeCount: 9,
  },
];

describe("draw search index", () => {
  it("matches a literal kanji", () => {
    expect(searchDrawIndex(entries, "四").map((entry) => entry.kanji)).toEqual(["四"]);
  });

  it("matches English meanings", () => {
    expect(searchDrawIndex(entries, "learn").map((entry) => entry.kanji)).toEqual(["学"]);
  });

  it("matches kunyomi with okurigana separators removed", () => {
    expect(searchDrawIndex(entries, "まなぶ").map((entry) => entry.kanji)).toEqual(["学"]);
  });

  it("matches onyomi typed as hiragana", () => {
    expect(searchDrawIndex(entries, "かい").map((entry) => entry.kanji)).toEqual(["海"]);
  });

  it("honors grade filters", () => {
    expect(searchDrawIndex(entries, "", [2]).map((entry) => entry.kanji)).toEqual(["海"]);
  });
});
