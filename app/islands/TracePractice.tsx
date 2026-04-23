import { useEffect, useRef, useState } from "hono/jsx";
import { getStrokeEndingLabel } from "../lib/kanji";
import { addCrossGuide, createSvgElement, svgPoint } from "../lib/practiceSvg";
import { canCompleteTrace, findNearestProgress, isNearPathLength, isTraceMoveWithinTolerance, pointDistance } from "../lib/trace";
import type { Stroke } from "../lib/types";

const TRACE_END_TOLERANCE = 12;
const TRACE_MIN_PROGRESS_STEP = 1;
const TRACE_RESUME_TOLERANCE = 18;
const TRACE_START_TOLERANCE = 15;

export default function TracePractice({
  grade,
  strokes,
  viewBox,
}: {
  grade: number;
  strokes: Stroke[];
  viewBox: string;
}) {
  const traceCanvasRef = useRef<HTMLDivElement | null>(null);
  const [traceCounter, setTraceCounter] = useState(strokes.length ? `1/${strokes.length}画め` : "");
  const [traceEnding, setTraceEnding] = useState(getStrokeEndingLabel(strokes, 0, "trace", grade));
  const [traceFinished, setTraceFinished] = useState(false);
  const [traceBuildNonce, setTraceBuildNonce] = useState(0);

  useEffect(() => {
    if (!traceCanvasRef.current) return;

    const container = traceCanvasRef.current;
    container.innerHTML = "";
    container.classList.remove("error");
    setTraceFinished(false);
    setTraceCounter(strokes.length ? `1/${strokes.length}画め` : "");
    setTraceEnding(getStrokeEndingLabel(strokes, 0, "trace", grade));

    const svg = createSvgElement("svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("width", "240");
    svg.setAttribute("height", "240");
    addCrossGuide(svg, viewBox, "#c0d0dc");

    strokes.forEach((stroke) => {
      const guidePath = createSvgElement("path");
      guidePath.setAttribute("d", stroke.d);
      guidePath.setAttribute("fill", "none");
      guidePath.setAttribute("stroke", "#d0dce6");
      guidePath.setAttribute("stroke-width", "3.5");
      guidePath.setAttribute("stroke-linecap", "round");
      guidePath.setAttribute("stroke-linejoin", "round");
      svg.appendChild(guidePath);
    });

    const tracePaths = strokes.map((stroke, index) => {
      const path = createSvgElement("path");
      path.setAttribute("d", stroke.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#e8a0aa");
      path.setAttribute("stroke-width", "4");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.style.opacity = index === 0 ? "1" : "0";
      svg.appendChild(path);
      return path;
    });

    container.appendChild(svg);

    let traceStrokeIndex = 0;
    let traceProgress = 0;
    let traceMoveCount = 0;
    let traceStarted = false;
    let traceIsDrawing = false;

    const removeTraceHint = () => {
      svg.querySelector(".trace-hint")?.remove();
    };

    const addTraceHint = (path: SVGPathElement, index: number) => {
      removeTraceHint();
      const totalLength = path.getTotalLength();
      const startPoint = path.getPointAtLength(0);
      const directionSampleLength = Math.min(Math.max(totalLength * 0.08, 3), 10);
      const directionPoint = path.getPointAtLength(Math.min(directionSampleLength, totalLength));
      const directionX = directionPoint.x - startPoint.x;
      const directionY = directionPoint.y - startPoint.y;
      const directionLength = Math.hypot(directionX, directionY) || 1;
      const normalizedDirectionX = directionX / directionLength;
      const normalizedDirectionY = directionY / directionLength;

      const normalA = { x: -normalizedDirectionY, y: normalizedDirectionX };
      const normalB = { x: normalizedDirectionY, y: -normalizedDirectionX };
      const upwardNormal = normalA.y <= normalB.y ? normalA : normalB;

      const badgeRadius = 7;
      const badgeOffset = 16;
      const badgePullback = 8;
      const badgeCenter = {
        x: startPoint.x + upwardNormal.x * badgeOffset - normalizedDirectionX * badgePullback,
        y: startPoint.y + upwardNormal.y * badgeOffset - normalizedDirectionY * badgePullback,
      };

      const targetLength = Math.min(Math.max(totalLength * 0.12, 3), 8);
      const targetPoint = path.getPointAtLength(Math.min(targetLength, totalLength));
      const angle = Math.atan2(targetPoint.y - badgeCenter.y, targetPoint.x - badgeCenter.x);

      const group = createSvgElement("g");
      group.setAttribute("class", "trace-hint");

      const circle = createSvgElement("circle");
      circle.setAttribute("cx", String(badgeCenter.x));
      circle.setAttribute("cy", String(badgeCenter.y));
      circle.setAttribute("r", "7");
      circle.setAttribute("fill", "rgba(76, 175, 80, 0.3)");
      circle.setAttribute("stroke", "#7aaa7e");
      circle.setAttribute("stroke-width", "1.2");
      circle.style.animation = "trace-pulse 1s ease-in-out infinite";
      group.appendChild(circle);

      const text = createSvgElement("text");
      text.setAttribute("x", String(badgeCenter.x));
      text.setAttribute("y", String(badgeCenter.y + 3.5));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "8");
      text.setAttribute("fill", "#7aaa7e");
      text.setAttribute("font-family", "sans-serif");
      text.setAttribute("font-weight", "bold");
      text.textContent = String(index + 1);
      group.appendChild(text);

      const connectorStartX = badgeCenter.x + Math.cos(angle) * badgeRadius;
      const connectorStartY = badgeCenter.y + Math.sin(angle) * badgeRadius;
      const connectorEndX = targetPoint.x - Math.cos(angle) * 3;
      const connectorEndY = targetPoint.y - Math.sin(angle) * 3;

      const connector = createSvgElement("line");
      connector.setAttribute("x1", String(connectorStartX));
      connector.setAttribute("x2", String(connectorEndX));
      connector.setAttribute("y1", String(connectorStartY));
      connector.setAttribute("y2", String(connectorEndY));
      connector.setAttribute("stroke", "#7aaa7e");
      connector.setAttribute("stroke-width", "1.8");
      connector.setAttribute("stroke-linecap", "round");
      group.appendChild(connector);

      const arrowLength = 7;
      const arrowWidth = 4;
      const tipX = targetPoint.x;
      const tipY = targetPoint.y;
      const backX = tipX - Math.cos(angle) * arrowLength;
      const backY = tipY - Math.sin(angle) * arrowLength;
      const leftX = backX + Math.cos(angle + Math.PI / 2) * arrowWidth;
      const leftY = backY + Math.sin(angle + Math.PI / 2) * arrowWidth;
      const rightX = backX + Math.cos(angle - Math.PI / 2) * arrowWidth;
      const rightY = backY + Math.sin(angle - Math.PI / 2) * arrowWidth;

      const arrow = createSvgElement("polygon");
      arrow.setAttribute("points", `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`);
      arrow.setAttribute("fill", "#7aaa7e");
      group.appendChild(arrow);

      svg.appendChild(group);
    };

    const initTraceStroke = (index: number) => {
      const path = tracePaths[index];
      path.style.opacity = "1";
      const totalLength = path.getTotalLength();
      path.style.strokeDasharray = String(totalLength);
      path.style.strokeDashoffset = String(totalLength);
      path.style.transition = "none";
      traceProgress = 0;
      traceMoveCount = 0;
      traceStarted = false;
      traceIsDrawing = false;
      setTraceCounter(`${index + 1}/${strokes.length}画め`);
      setTraceEnding(getStrokeEndingLabel(strokes, index, "trace", grade));
      addTraceHint(path, index);
    };

    const completeTraceStroke = () => {
      const path = tracePaths[traceStrokeIndex];
      path.style.transition = "stroke-dashoffset 0.15s ease";
      path.style.strokeDashoffset = "0";
      traceIsDrawing = false;
      traceStarted = false;
      traceMoveCount = 0;
      container.classList.remove("error");
      traceStrokeIndex += 1;
      traceProgress = 0;

      if (traceStrokeIndex >= tracePaths.length) {
        setTraceFinished(true);
        setTraceCounter("");
        setTraceEnding("");
        removeTraceHint();
        return;
      }

      window.setTimeout(() => {
        initTraceStroke(traceStrokeIndex);
      }, 200);
    };

    const onTraceStart = (event: PointerEvent) => {
      if (traceStrokeIndex >= tracePaths.length) return;

      event.preventDefault();
      traceIsDrawing = false;
      traceStarted = false;
      container.classList.remove("error");
      const point = svgPoint(svg, event.clientX, event.clientY);
      const path = tracePaths[traceStrokeIndex];

      if (traceProgress > 0) {
        if (isNearPathLength(path, point, traceProgress, TRACE_RESUME_TOLERANCE)) {
          traceStarted = true;
          traceIsDrawing = true;
        }
        return;
      }

      const startPoint = path.getPointAtLength(0);
      if (pointDistance(point, startPoint) < TRACE_START_TOLERANCE) {
        traceStarted = true;
        traceIsDrawing = true;
        traceMoveCount = 0;
        removeTraceHint();
      }
    };

    const onTraceMove = (event: PointerEvent) => {
      if (!traceIsDrawing || !traceStarted || traceStrokeIndex >= tracePaths.length) return;

      event.preventDefault();
      const point = svgPoint(svg, event.clientX, event.clientY);
      const path = tracePaths[traceStrokeIndex];
      const totalLength = path.getTotalLength();
      const nearest = findNearestProgress(path, point, traceProgress);

      if (isTraceMoveWithinTolerance(nearest.distance) && nearest.length >= traceProgress) {
        const progressDelta = nearest.length - traceProgress;
        traceProgress = nearest.length;
        if (progressDelta >= TRACE_MIN_PROGRESS_STEP) {
          traceMoveCount += 1;
        }
        path.style.strokeDashoffset = String(totalLength - traceProgress);
        container.classList.remove("error");

        const ending = getStrokeEndingLabel(strokes, traceStrokeIndex, "trace", grade);
        if (canCompleteTrace(path, { ending, moveCount: traceMoveCount, point, progress: traceProgress })) {
          completeTraceStroke();
        }
      } else if (!isTraceMoveWithinTolerance(nearest.distance)) {
        container.classList.add("error");
      }
    };

    const onTraceEnd = (event: PointerEvent) => {
      if (
        traceIsDrawing
        && traceStarted
        && traceStrokeIndex < tracePaths.length
        && typeof event.clientX === "number"
        && typeof event.clientY === "number"
      ) {
        const point = svgPoint(svg, event.clientX, event.clientY);
        const path = tracePaths[traceStrokeIndex];
        const ending = getStrokeEndingLabel(strokes, traceStrokeIndex, "trace", grade);

        if (canCompleteTrace(path, {
          allowLiftCompletion: true,
          ending,
          moveCount: traceMoveCount,
          point,
          progress: traceProgress,
        })) {
          completeTraceStroke();
          return;
        }
      }

      traceIsDrawing = false;
      traceStarted = false;
    };

    initTraceStroke(0);

    svg.addEventListener("pointerdown", onTraceStart);
    svg.addEventListener("pointermove", onTraceMove);
    svg.addEventListener("pointerup", onTraceEnd);
    svg.addEventListener("pointerleave", onTraceEnd);

    return () => {
      svg.removeEventListener("pointerdown", onTraceStart);
      svg.removeEventListener("pointermove", onTraceMove);
      svg.removeEventListener("pointerup", onTraceEnd);
      svg.removeEventListener("pointerleave", onTraceEnd);
      container.innerHTML = "";
    };
  }, [grade, strokes, traceBuildNonce, viewBox]);

  return (
    <div class="trace-area">
      <div class="trace-canvas" ref={traceCanvasRef} />
      <div class="trace-info">
        <span class="trace-counter">{traceCounter}</span>
        {traceEnding ? (
          <span
            class={`trace-ending-hint${traceEnding === "はね" ? " is-hane" : traceEnding === "はらい" ? " is-harai" : " is-tome"}`}
          >
            <span class="trace-ending-kicker">さいごは</span>
            <span class="trace-ending-value">{traceEnding}</span>
          </span>
        ) : null}
        {traceFinished ? (
          <button
            class="trace-retry-btn"
            type="button"
            onClick={() => {
              setTraceFinished(false);
              setTraceBuildNonce((value) => value + 1);
            }}
          >
            <span aria-hidden="true" class="trace-retry-icon">
              ↺
            </span>
            <span>もういちど</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
