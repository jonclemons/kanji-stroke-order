import { describe, expect, it } from "vitest";
import {
  compareBinaryMasks,
  drawingScoreStatus,
  findInkBoundsFromImageData,
  imageDataToBinaryMask,
  scoreQuadrants,
} from "../../app/lib/drawing";

function makeImageData(width: number, height: number, inkPixels: Array<[number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);

  inkPixels.forEach(([x, y]) => {
    const index = (y * width + x) * 4;
    data[index] = 0;
    data[index + 1] = 0;
    data[index + 2] = 0;
    data[index + 3] = 255;
  });

  return { data, width, height };
}

describe("drawing raster helpers", () => {
  it("finds ink bounds in synthetic image data", () => {
    const imageData = makeImageData(8, 8, [[2, 3], [3, 3], [4, 5]]);

    expect(findInkBoundsFromImageData(imageData)).toEqual({
      bottom: 5,
      height: 3,
      left: 2,
      right: 4,
      top: 3,
      width: 3,
    });
  });

  it("scores identical masks higher than shifted masks", () => {
    const target = imageDataToBinaryMask(makeImageData(8, 8, [[2, 2], [3, 2], [4, 2]]));
    const same = imageDataToBinaryMask(makeImageData(8, 8, [[2, 2], [3, 2], [4, 2]]));
    const shifted = imageDataToBinaryMask(makeImageData(8, 8, [[2, 6], [3, 6], [4, 6]]));

    expect(compareBinaryMasks(same, target, 8, 8, 1).score).toBeGreaterThan(0.95);
    expect(compareBinaryMasks(shifted, target, 8, 8, 1).score).toBeLessThan(0.5);
  });

  it("reports quadrant scores for the four writing rooms", () => {
    const target = imageDataToBinaryMask(makeImageData(8, 8, [[1, 1], [6, 1], [1, 6], [6, 6]]));
    const user = imageDataToBinaryMask(makeImageData(8, 8, [[1, 1], [6, 1], [1, 6]]));
    const quadrants = scoreQuadrants(user, target, 8, 8, 1);

    expect(quadrants.map((quadrant) => quadrant.label)).toEqual(["ひだりうえ", "みぎうえ", "ひだりした", "みぎした"]);
    expect(quadrants.find((quadrant) => quadrant.id === "bottom-right")?.score).toBe(0);
  });

  it("uses kid-facing score status labels", () => {
    expect(drawingScoreStatus(0.9)).toBe("よくかけた");
    expect(drawingScoreStatus(0.6)).toBe("もうすこし");
    expect(drawingScoreStatus(0.2)).toBe("ちがうかも");
  });
});
