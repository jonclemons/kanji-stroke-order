import { useEffect, useRef, useState } from "hono/jsx";
import { getStrokeEndingLabel } from "../lib/kanji";
import { canCompleteTrace, findNearestProgress, isNearPathLength, isTraceMoveWithinTolerance, pointDistance } from "../lib/trace";
import type { Stroke } from "../lib/types";

const TRACE_END_TOLERANCE = 12;
const TRACE_MIN_PROGRESS_STEP = 1;
const TRACE_RESUME_TOLERANCE = 18;
const TRACE_START_TOLERANCE = 15;

function createSvgElement<TagName extends keyof SVGElementTagNameMap>(tagName: TagName) {
  return document.createElementNS("http://www.w3.org/2000/svg", tagName);
}

function parseViewBox(viewBox: string) {
  const [x = 0, y = 0, width = 109, height = 109] = viewBox.split(/\s+/).map(Number);
  return { x, y, width, height };
}

function addCrossGuide(svg: SVGSVGElement, viewBox: string, color: string) {
  const { x, y, width, height } = parseViewBox(viewBox);
  const centerX = x + width / 2;
  const centerY = y + height / 2;

  const verticalLine = createSvgElement("line");
  verticalLine.setAttribute("x1", String(centerX));
  verticalLine.setAttribute("x2", String(centerX));
  verticalLine.setAttribute("y1", String(y));
  verticalLine.setAttribute("y2", String(y + height));
  verticalLine.setAttribute("stroke", color);
  verticalLine.setAttribute("stroke-width", "0.8");
  verticalLine.setAttribute("stroke-dasharray", "3 3");

  const horizontalLine = createSvgElement("line");
  horizontalLine.setAttribute("x1", String(x));
  horizontalLine.setAttribute("x2", String(x + width));
  horizontalLine.setAttribute("y1", String(centerY));
  horizontalLine.setAttribute("y2", String(centerY));
  horizontalLine.setAttribute("stroke", color);
  horizontalLine.setAttribute("stroke-width", "0.8");
  horizontalLine.setAttribute("stroke-dasharray", "3 3");

  svg.appendChild(verticalLine);
  svg.appendChild(horizontalLine);
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };

  const inverse = ctm.inverse();
  return {
    x: inverse.a * clientX + inverse.c * clientY + inverse.e,
    y: inverse.b * clientX + inverse.d * clientY + inverse.f,
  };
}

export default function PracticeAnimator({
  grade,
  strokes,
  viewBox,
}: {
  grade: number;
  strokes: Stroke[];
  viewBox: string;
}) {
  const animationCanvasRef = useRef<HTMLDivElement | null>(null);
  const traceCanvasRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"animation" | "trace">("animation");
  const [traceCounter, setTraceCounter] = useState(strokes.length ? `1/${strokes.length}画め` : "");
  const [traceEnding, setTraceEnding] = useState(getStrokeEndingLabel(strokes, 0, "trace", grade));
  const [traceFinished, setTraceFinished] = useState(false);
  const [traceBuildNonce, setTraceBuildNonce] = useState(0);

  useEffect(() => {
    if (mode !== "animation" || !animationCanvasRef.current) return;

    const container = animationCanvasRef.current;
    container.innerHTML = "";

    const svg = createSvgElement("svg");
    svg.setAttribute("viewBox", viewBox);
    svg.setAttribute("width", "240");
    svg.setAttribute("height", "240");
    addCrossGuide(svg, viewBox, "#c0d0dc");

    const paths = strokes.map((stroke) => {
      const path = createSvgElement("path");
      path.setAttribute("d", stroke.d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#a0b0bc");
      path.setAttribute("stroke-width", "3.5");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.style.opacity = "0";
      svg.appendChild(path);
      return path;
    });

    container.appendChild(svg);

    const stopAnimation = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const getDrawDuration = () => 280;
    let step = -1;

    const nextStep = () => {
      if (step >= 0 && step < paths.length) {
        paths[step].setAttribute("stroke", "#a0b0bc");
      }

      step += 1;

      if (step >= paths.length) {
        timerRef.current = window.setTimeout(() => {
          paths.forEach((path) => {
            path.style.opacity = "0";
            path.style.transition = "none";
            path.style.strokeDashoffset = "0";
            path.style.strokeDasharray = "none";
            path.setAttribute("stroke", "#a0b0bc");
            path.setAttribute("stroke-width", "3.5");
          });
          step = -1;
          timerRef.current = window.setTimeout(nextStep, 300);
        }, 1000);
        return;
      }

      const path = paths[step];
      path.style.opacity = "1";
      path.setAttribute("stroke", "#e8a0aa");
      path.setAttribute("stroke-width", "4.5");

      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = String(length);
      path.style.transition = `stroke-dashoffset ${getDrawDuration()}ms ease`;
      path.getBoundingClientRect();
      path.style.strokeDashoffset = "0";

      timerRef.current = window.setTimeout(nextStep, 150 + getDrawDuration());
    };

    nextStep();

    return () => {
      stopAnimation();
      container.innerHTML = "";
    };
  }, [mode, strokes, viewBox]);

  useEffect(() => {
    if (mode !== "trace" || !traceCanvasRef.current) return;

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
  }, [grade, mode, strokes, traceBuildNonce, viewBox]);

  return (
    <div class="section">
      <div class="mode-header">
        <h3>{mode === "trace" ? "なぞってみよう" : "アニメーション"}</h3>
        <button
          class="mode-toggle-btn"
          title="モードきりかえ"
          type="button"
          onClick={() => {
            if (mode === "trace") {
              setTraceFinished(false);
              setTraceCounter(strokes.length ? `1/${strokes.length}画め` : "");
              setTraceEnding(getStrokeEndingLabel(strokes, 0, "trace", grade));
              setMode("animation");
            } else {
              setMode("trace");
            }
          }}
        >
          {mode === "trace" ? "▶ アニメーション" : "✏ なぞる"}
        </button>
      </div>

      {mode === "animation" ? (
        <div id="animationWrap">
          <div class="animation-canvas" ref={animationCanvasRef} />
        </div>
      ) : (
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
      )}
    </div>
  );
}
