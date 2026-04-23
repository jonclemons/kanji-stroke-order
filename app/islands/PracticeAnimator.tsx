import { useEffect, useRef, useState } from "hono/jsx";
import { getStrokeEndingLabel } from "../lib/kanji";
import { addCrossGuide, createSvgElement } from "../lib/practiceSvg";
import type { Stroke } from "../lib/types";

type TracePracticeComponent = typeof import("./TracePractice").default;

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
  const timerRef = useRef<number | null>(null);
  const [mode, setMode] = useState<"animation" | "trace">("animation");
  const [TracePractice, setTracePractice] = useState<TracePracticeComponent | null>(null);

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
    if (mode !== "trace" || TracePractice) return;

    let cancelled = false;

    void import("./TracePractice").then((module) => {
      if (!cancelled) {
        setTracePractice(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [TracePractice, mode]);

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
        TracePractice ? (
          <TracePractice grade={grade} strokes={strokes} viewBox={viewBox} />
        ) : (
          <TracePracticeFallback grade={grade} strokes={strokes} />
        )
      )}
    </div>
  );
}

function TracePracticeFallback({
  grade,
  strokes,
}: {
  grade: number;
  strokes: Stroke[];
}) {
  const traceEnding = getStrokeEndingLabel(strokes, 0, "trace", grade);

  return (
    <div class="trace-area">
      <div class="trace-canvas" aria-hidden="true" />
      <div class="trace-info">
        <span class="trace-counter">{strokes.length ? `1/${strokes.length}画め` : ""}</span>
        {traceEnding ? (
          <span
            class={`trace-ending-hint${traceEnding === "はね" ? " is-hane" : traceEnding === "はらい" ? " is-harai" : " is-tome"}`}
          >
            <span class="trace-ending-kicker">さいごは</span>
            <span class="trace-ending-value">{traceEnding}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
