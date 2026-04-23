import { useEffect, useRef, useState } from "hono/jsx";
import type { Stroke } from "../lib/types";

type PracticeAnimatorComponent = typeof import("./PracticeAnimator").default;

export default function DeferredPracticeAnimator({
  grade,
  strokes,
  viewBox,
}: {
  grade: number;
  strokes: Stroke[];
  viewBox: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [Animator, setAnimator] = useState<PracticeAnimatorComponent | null>(null);

  useEffect(() => {
    if (shouldLoad) return;

    const node = containerRef.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || Animator) return;

    let cancelled = false;

    void import("./PracticeAnimator").then((module) => {
      if (!cancelled) {
        setAnimator(() => module.default);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [Animator, shouldLoad]);

  return (
    <div ref={containerRef}>
      {Animator ? <Animator grade={grade} strokes={strokes} viewBox={viewBox} /> : <PracticeAnimatorSkeleton />}
    </div>
  );
}

function PracticeAnimatorSkeleton() {
  return (
    <div class="section">
      <div class="mode-header">
        <h3>アニメーション</h3>
        <button class="mode-toggle-btn" type="button" disabled>
          ✏ なぞる
        </button>
      </div>
      <div id="animationWrap">
        <div class="animation-canvas" aria-hidden="true" />
      </div>
    </div>
  );
}
