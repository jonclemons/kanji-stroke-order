const TRACE_PATH_TOLERANCE = 18;
const TRACE_END_TOLERANCE = 12;
const TRACE_COMPLETION_RATIO = 0.96;
const TRACE_MIN_MOVE_COUNT = 6;

export function pointDistance(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getMinTraceMoveCount(totalLength: number) {
  if (totalLength < 40) return 2;
  if (totalLength < 70) return 3;
  if (totalLength < 100) return 4;
  return TRACE_MIN_MOVE_COUNT;
}

export function isNearPathLength(
  path: SVGPathElement,
  point: { x: number; y: number },
  length: number,
  tolerance: number,
) {
  const clampedLength = Math.max(0, Math.min(path.getTotalLength(), length));
  const pathPoint = path.getPointAtLength(clampedLength);
  return pointDistance(point, pathPoint) < tolerance;
}

export function findNearestProgress(
  path: SVGPathElement,
  point: { x: number; y: number },
  currentProgress: number,
) {
  const totalLength = path.getTotalLength();
  const maxJump = Math.max(5, totalLength * 0.1);
  const searchStart = Math.max(0, currentProgress - 5);
  const searchEnd = Math.min(totalLength, currentProgress + maxJump);
  let bestDistance = Infinity;
  let bestLength = currentProgress;
  const step = 1.5;

  for (let length = searchStart; length <= searchEnd; length += step) {
    const pathPoint = path.getPointAtLength(length);
    const dx = pathPoint.x - point.x;
    const dy = pathPoint.y - point.y;
    const distance = dx * dx + dy * dy;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestLength = length;
    }
  }

  return { distance: Math.sqrt(bestDistance), length: bestLength };
}

function isNearPathCompletionZone(
  path: SVGPathElement,
  point: { x: number; y: number },
  startLength: number,
  tolerance: number,
) {
  const totalLength = path.getTotalLength();
  const searchStart = Math.max(0, Math.min(totalLength, startLength));
  const step = 1.5;

  for (let length = searchStart; length <= totalLength; length += step) {
    const pathPoint = path.getPointAtLength(length);
    if (pointDistance(point, pathPoint) < tolerance) return true;
  }

  return isNearPathLength(path, point, totalLength, tolerance);
}

export function getTraceCompletionProfile(
  totalLength: number,
  ending: string,
  {
    allowLiftCompletion = false,
  }: {
    allowLiftCompletion?: boolean;
  } = {},
) {
  const baseMinMoves = allowLiftCompletion
    ? Math.max(2, getMinTraceMoveCount(totalLength) - 1)
    : getMinTraceMoveCount(totalLength);

  if (ending === "はらい") {
    return {
      endTolerance: (allowLiftCompletion ? TRACE_END_TOLERANCE + 5 : TRACE_END_TOLERANCE) + 8,
      minMoves: Math.max(1, baseMinMoves - 1),
      minRatio: allowLiftCompletion ? 0.8 : 0.88,
      zoneRatio: allowLiftCompletion ? 0.72 : 0.8,
    };
  }

  if (ending === "はね") {
    return {
      endTolerance: (allowLiftCompletion ? TRACE_END_TOLERANCE + 5 : TRACE_END_TOLERANCE) + 5,
      minMoves: Math.max(1, baseMinMoves - 1),
      minRatio: allowLiftCompletion ? 0.84 : 0.9,
      zoneRatio: allowLiftCompletion ? 0.78 : 0.84,
    };
  }

  return {
    endTolerance: allowLiftCompletion ? TRACE_END_TOLERANCE + 3 : TRACE_END_TOLERANCE,
    minMoves: baseMinMoves,
    minRatio: allowLiftCompletion ? 0.9 : TRACE_COMPLETION_RATIO,
    zoneRatio: allowLiftCompletion ? 0.86 : 0.92,
  };
}

export function canCompleteTrace(
  path: SVGPathElement,
  {
    point,
    progress,
    moveCount,
    ending,
    allowLiftCompletion = false,
  }: {
    allowLiftCompletion?: boolean;
    ending: string;
    moveCount: number;
    point: { x: number; y: number };
    progress: number;
  },
) {
  const totalLength = path.getTotalLength();
  const profile = getTraceCompletionProfile(totalLength, ending, { allowLiftCompletion });

  return (
    progress / totalLength >= profile.minRatio
    && moveCount >= profile.minMoves
    && isNearPathCompletionZone(path, point, totalLength * profile.zoneRatio, profile.endTolerance)
  );
}

export function isTraceMoveWithinTolerance(distance: number) {
  return distance < TRACE_PATH_TOLERANCE;
}
