export type RasterBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type ImageDataLike = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

export type MaskComparison = {
  coverage: number;
  precision: number;
  score: number;
  userPixels: number;
  targetPixels: number;
};

export type QuadrantScore = {
  id: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  label: string;
  score: number;
};

const QUADRANTS: QuadrantScore["id"][] = ["top-left", "top-right", "bottom-left", "bottom-right"];
const QUADRANT_LABELS: Record<QuadrantScore["id"], string> = {
  "top-left": "ひだりうえ",
  "top-right": "みぎうえ",
  "bottom-left": "ひだりした",
  "bottom-right": "みぎした",
};

export function isInkPixel(data: Uint8ClampedArray, index: number, alphaThreshold = 8, lightnessThreshold = 245) {
  const alpha = data[index + 3] || 0;
  if (alpha <= alphaThreshold) return false;

  const red = data[index] || 0;
  const green = data[index + 1] || 0;
  const blue = data[index + 2] || 0;
  const luma = red * 0.299 + green * 0.587 + blue * 0.114;
  return luma < lightnessThreshold;
}

export function findInkBoundsFromImageData(imageData: ImageDataLike): RasterBounds | null {
  let left = imageData.width;
  let top = imageData.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const index = (y * imageData.width + x) * 4;
      if (!isInkPixel(imageData.data, index)) continue;

      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }

  if (right < left || bottom < top) return null;

  return {
    left,
    top,
    right,
    bottom,
    width: right - left + 1,
    height: bottom - top + 1,
  };
}

export function imageDataToBinaryMask(imageData: ImageDataLike) {
  const mask = new Uint8Array(imageData.width * imageData.height);

  for (let y = 0; y < imageData.height; y += 1) {
    for (let x = 0; x < imageData.width; x += 1) {
      const pixel = y * imageData.width + x;
      mask[pixel] = isInkPixel(imageData.data, pixel * 4) ? 1 : 0;
    }
  }

  return mask;
}

export function dilateBinaryMask(mask: Uint8Array, width: number, height: number, radius = 1) {
  if (radius <= 0) return new Uint8Array(mask);

  const dilated = new Uint8Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;

      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nextX = x + dx;
          const nextY = y + dy;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          if (Math.hypot(dx, dy) > radius + 0.25) continue;
          dilated[nextY * width + nextX] = 1;
        }
      }
    }
  }

  return dilated;
}

export function compareBinaryMasks(
  userMask: Uint8Array,
  targetMask: Uint8Array,
  width: number,
  height: number,
  tolerance = 2,
): MaskComparison {
  if (userMask.length !== targetMask.length || userMask.length !== width * height) {
    throw new Error("Mask dimensions do not match");
  }

  const userDilated = dilateBinaryMask(userMask, width, height, tolerance);
  const targetDilated = dilateBinaryMask(targetMask, width, height, tolerance);

  let targetPixels = 0;
  let userPixels = 0;
  let coveredTargetPixels = 0;
  let userPixelsOnTarget = 0;

  for (let i = 0; i < targetMask.length; i += 1) {
    if (targetMask[i]) {
      targetPixels += 1;
      if (userDilated[i]) coveredTargetPixels += 1;
    }

    if (userMask[i]) {
      userPixels += 1;
      if (targetDilated[i]) userPixelsOnTarget += 1;
    }
  }

  const coverage = targetPixels > 0 ? coveredTargetPixels / targetPixels : 0;
  const precision = userPixels > 0 ? userPixelsOnTarget / userPixels : 0;
  const score = coverage + precision > 0 ? (2 * coverage * precision) / (coverage + precision) : 0;

  return { coverage, precision, score, targetPixels, userPixels };
}

export function scoreQuadrants(
  userMask: Uint8Array,
  targetMask: Uint8Array,
  width: number,
  height: number,
  tolerance = 2,
): QuadrantScore[] {
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);

  return QUADRANTS.map((id) => {
    const xStart = id.endsWith("right") ? midX : 0;
    const xEnd = id.endsWith("right") ? width : midX;
    const yStart = id.startsWith("bottom") ? midY : 0;
    const yEnd = id.startsWith("bottom") ? height : midY;
    const regionWidth = xEnd - xStart;
    const regionHeight = yEnd - yStart;
    const userRegion = new Uint8Array(regionWidth * regionHeight);
    const targetRegion = new Uint8Array(regionWidth * regionHeight);

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const sourceIndex = y * width + x;
        const regionIndex = (y - yStart) * regionWidth + (x - xStart);
        userRegion[regionIndex] = userMask[sourceIndex];
        targetRegion[regionIndex] = targetMask[sourceIndex];
      }
    }

    return {
      id,
      label: QUADRANT_LABELS[id],
      score: compareBinaryMasks(userRegion, targetRegion, regionWidth, regionHeight, tolerance).score,
    };
  });
}

export function drawingScoreStatus(score: number) {
  if (score >= 0.78) return "よくかけた";
  if (score >= 0.55) return "もうすこし";
  return "ちがうかも";
}
