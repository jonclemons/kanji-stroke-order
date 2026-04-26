import { useEffect, useMemo, useRef, useState } from "hono/jsx";
import {
  drawSearchEntryFromInfo,
  EDUCATION_GRADES,
  isEducationGrade,
  searchDrawIndex,
  type DrawSearchEntry,
  type EducationGrade,
} from "../lib/drawSearch";
import {
  compareBinaryMasks,
  drawingScoreStatus,
  findInkBoundsFromImageData,
  imageDataToBinaryMask,
  scoreQuadrants,
  type ImageDataLike,
  type MaskComparison,
  type QuadrantScore,
  type RasterBounds,
} from "../lib/drawing";
import { getViewBox, kanjiToHex, parseStrokes, parseViewBox } from "../lib/kanji";
import type { RecognitionCandidate, RecognitionInput, RecognitionProvider } from "../lib/recognizer";
import type { KanjiInfo, Stroke } from "../lib/types";

type DrawMode = "search" | "check";
type DrawPoint = { x: number; y: number };
type DrawStroke = { points: DrawPoint[] };
type TargetSvg = { strokes: Stroke[]; viewBox: string };
type HydratedCandidate = RecognitionCandidate & { entry?: DrawSearchEntry };
type Manifest = { grades: Record<string, string[]> };

type ScoreReport = {
  finalStroke: MaskComparison | null;
  overall: MaskComparison;
  quadrants: QuadrantScore[];
  status: string;
  target: DrawSearchEntry;
};

type DrawSearchLabProps = {
  dataVersion: string;
  labelsUrl: string;
  modelUrl: string;
  wasmBaseUrl: string;
};

const CANVAS_SIZE = 512;
const DRAW_LINE_WIDTH = 16;
const MODEL_INPUT_SIZE = 64;
const SCORE_SIZE = 128;
const RESULT_LIMITS = [8, 12, 20] as const;
const DEFAULT_TARGET = "四";
const CACHE_NAME = "kanji-draw-lab-v1";
const runtimeScriptPromises = new Map<string, Promise<void>>();

export default function DrawSearchLab({
  dataVersion,
  labelsUrl,
  modelUrl,
  wasmBaseUrl,
}: DrawSearchLabProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activeStrokeRef = useRef<DrawStroke | null>(null);
  const strokesRef = useRef<DrawStroke[]>([]);
  const providerPromiseRef = useRef<Promise<RecognitionProvider> | null>(null);
  const [mode, setMode] = useState<DrawMode>("search");
  const [entries, setEntries] = useState<DrawSearchEntry[]>([]);
  const [indexStatus, setIndexStatus] = useState("よみこみ中");
  const [query, setQuery] = useState("");
  const [resultLimit, setResultLimit] = useState<(typeof RESULT_LIMITS)[number]>(12);
  const [selectedGrades, setSelectedGrades] = useState<EducationGrade[]>([...EDUCATION_GRADES]);
  const [strokeCount, setStrokeCount] = useState(0);
  const [traceVisible, setTraceVisible] = useState(true);
  const [recognitionCandidates, setRecognitionCandidates] = useState<HydratedCandidate[]>([]);
  const [recognitionStatus, setRecognitionStatus] = useState("まだ さがしていません");
  const [selectedTarget, setSelectedTarget] = useState<DrawSearchEntry | null>(null);
  const [targetSvg, setTargetSvg] = useState<TargetSvg | null>(null);
  const [scoreReport, setScoreReport] = useState<ScoreReport | null>(null);
  const [scoreStatus, setScoreStatus] = useState("かいてから チェックしてね");

  const indexByKanji = useMemo(() => {
    return new Map(entries.map((entry) => [entry.kanji, entry]));
  }, [entries]);

  const textResults = useMemo(() => {
    return searchDrawIndex(entries, query, selectedGrades, resultLimit);
  }, [entries, query, resultLimit, selectedGrades]);

  useEffect(() => {
    let cancelled = false;

    setIndexStatus("よみこみ中");
    void loadEducationSearchIndex(dataVersion)
      .then((nextEntries) => {
        if (cancelled) return;
        setEntries(nextEntries);
        setIndexStatus(`${nextEntries.length}字`);
        setSelectedTarget(nextEntries.find((entry) => entry.kanji === DEFAULT_TARGET) || nextEntries[0] || null);
      })
      .catch(() => {
        if (cancelled) return;
        setIndexStatus("よみこみできません");
      });

    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = CANVAS_SIZE * dpr;
      canvas.height = CANVAS_SIZE * dpr;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      redrawDrawingCanvas();
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  useEffect(() => {
    if (!selectedTarget) {
      setTargetSvg(null);
      return;
    }

    let cancelled = false;
    void fetchKanjiSvg(dataVersion, selectedTarget.kanji)
      .then((svgText) => {
        if (cancelled) return;
        setTargetSvg({
          strokes: parseStrokes(svgText),
          viewBox: getViewBox(svgText),
        });
      })
      .catch(() => {
        if (!cancelled) setTargetSvg(null);
      });

    return () => {
      cancelled = true;
    };
  }, [dataVersion, selectedTarget]);

  useEffect(() => {
    if (!isStandalonePwa() || window.navigator.connection?.saveData) return;

    const warmup = () => {
      void warmRecognizerCache(modelUrl, labelsUrl);
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(warmup, { timeout: 5000 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(warmup, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [labelsUrl, modelUrl]);

  function redrawDrawingCanvas() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    drawStrokes(context, strokesRef.current, DRAW_LINE_WIDTH);
  }

  function resetReports() {
    setScoreReport(null);
    setScoreStatus("かいてから チェックしてね");
  }

  function beginStroke(event: PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const point = canvasPoint(event, canvas);
    const stroke: DrawStroke = { points: [point] };
    activeStrokeRef.current = stroke;
    strokesRef.current = [...strokesRef.current, stroke];
    setStrokeCount(strokesRef.current.length);
    resetReports();
    redrawDrawingCanvas();
  }

  function continueStroke(event: PointerEvent) {
    const canvas = canvasRef.current;
    const stroke = activeStrokeRef.current;
    if (!canvas || !stroke) return;

    event.preventDefault();
    const point = canvasPoint(event, canvas);
    const previousPoint = stroke.points[stroke.points.length - 1];
    if (previousPoint && Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y) < 1.5) return;

    stroke.points.push(point);
    redrawDrawingCanvas();
  }

  function endStroke(event: PointerEvent) {
    const canvas = canvasRef.current;
    canvas?.releasePointerCapture?.(event.pointerId);
    activeStrokeRef.current = null;
  }

  function undoStroke() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    activeStrokeRef.current = null;
    setStrokeCount(strokesRef.current.length);
    resetReports();
    redrawDrawingCanvas();
  }

  function clearDrawing() {
    strokesRef.current = [];
    activeStrokeRef.current = null;
    setStrokeCount(0);
    setRecognitionCandidates([]);
    setRecognitionStatus("まだ さがしていません");
    resetReports();
    redrawDrawingCanvas();
  }

  function toggleGrade(grade: EducationGrade) {
    setSelectedGrades((currentGrades) => {
      if (currentGrades.includes(grade)) {
        return currentGrades.length === 1 ? currentGrades : currentGrades.filter((item) => item !== grade);
      }

      return [...currentGrades, grade].sort((a, b) => a - b) as EducationGrade[];
    });
  }

  async function recognizeDrawing() {
    if (strokesRef.current.length === 0) {
      setRecognitionStatus("まず かいてね");
      return;
    }

    const normalized = normalizeStrokesForCanvas(strokesRef.current, MODEL_INPUT_SIZE);
    if (!normalized) {
      setRecognitionStatus("線が みつかりません");
      return;
    }

    setRecognitionStatus("モデルを よみこみ中");

    try {
      if (!providerPromiseRef.current) {
        providerPromiseRef.current = createLocalTfliteProvider({ labelsUrl, modelUrl, wasmBaseUrl });
      }

      const provider = await providerPromiseRef.current;
      setRecognitionStatus("さがしています");
      const recognitionInput: RecognitionInput = {
        bounds: normalized.bounds,
        height: MODEL_INPUT_SIZE,
        values: normalized.values,
        width: MODEL_INPUT_SIZE,
      };
      const rawCandidates = await provider.recognize(recognitionInput, Math.max(1000, resultLimit * 80));
      const hydratedCandidates = rawCandidates
        .map((candidate) => ({ ...candidate, entry: indexByKanji.get(candidate.kanji) }))
        .filter((candidate) => {
          return candidate.entry && selectedGrades.includes(candidate.entry.grade);
        })
        .slice(0, resultLimit)
        .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

      setRecognitionCandidates(hydratedCandidates);
      setRecognitionStatus(hydratedCandidates.length ? `${hydratedCandidates.length}けん みつかりました` : "候補が みつかりません");
    } catch (error) {
      providerPromiseRef.current = null;
      setRecognitionStatus(error instanceof Error ? error.message : "モデルを よめません");
    }
  }

  function selectTarget(entry: DrawSearchEntry) {
    setSelectedTarget(entry);
    setMode("check");
    setScoreReport(null);
    setScoreStatus("かいてから チェックしてね");
  }

  function checkDrawing() {
    if (!selectedTarget || !targetSvg || targetSvg.strokes.length === 0) {
      setScoreStatus("おてほんを えらんでね");
      return;
    }

    if (strokesRef.current.length === 0) {
      setScoreStatus("まず かいてね");
      return;
    }

    const user = normalizeStrokesForCanvas(strokesRef.current, SCORE_SIZE);
    if (!user) {
      setScoreStatus("線が みつかりません");
      return;
    }

    const targetImage = renderTargetToImageData(targetSvg, SCORE_SIZE);
    const userMask = imageDataToBinaryMask(user.imageData);
    const targetMask = imageDataToBinaryMask(targetImage);
    const overall = compareBinaryMasks(userMask, targetMask, SCORE_SIZE, SCORE_SIZE, 2);
    const quadrants = scoreQuadrants(userMask, targetMask, SCORE_SIZE, SCORE_SIZE, 2);
    const finalStroke = scoreFinalStroke(strokesRef.current, user.bounds, targetSvg);
    const status = drawingScoreStatus(overall.score);

    setScoreReport({
      finalStroke,
      overall,
      quadrants,
      status,
      target: selectedTarget,
    });
    setScoreStatus(status);
  }

  const visibleCandidates = recognitionCandidates.length > 0 ? recognitionCandidates : [];

  return (
    <div class="draw-lab-shell">
      <section class="draw-lab-board" aria-label="てがきエリア">
        <div class="draw-canvas-wrap">
          {traceVisible && targetSvg ? <ReferenceSvg className="draw-canvas-trace" targetSvg={targetSvg} /> : null}
          <canvas
            aria-label="かくところ"
            class="draw-canvas"
            ref={canvasRef}
            onPointerCancel={endStroke}
            onPointerDown={beginStroke}
            onPointerMove={continueStroke}
            onPointerUp={endStroke}
          />
        </div>

        <div class="draw-toolbar" aria-label="かくためのボタン">
          <button type="button" class="draw-tool-btn" onClick={undoStroke} disabled={strokeCount === 0}>
            もどす
          </button>
          <button type="button" class="draw-tool-btn" onClick={clearDrawing} disabled={strokeCount === 0}>
            けす
          </button>
          <button
            type="button"
            class={`draw-tool-btn${traceVisible ? " is-active" : ""}`}
            aria-pressed={traceVisible}
            onClick={() => setTraceVisible((visible) => !visible)}
          >
            おてほん
          </button>
          <span class="draw-stroke-count">{strokeCount}かく</span>
        </div>
      </section>

      <section class="draw-lab-panel" aria-label="てがきラボ">
        <div class="draw-mode-tabs" role="tablist" aria-label="ラボ">
          <button
            type="button"
            class={`draw-mode-tab${mode === "search" ? " is-active" : ""}`}
            aria-selected={mode === "search"}
            role="tab"
            onClick={() => setMode("search")}
          >
            てがきでさがす
          </button>
          <button
            type="button"
            class={`draw-mode-tab${mode === "check" ? " is-active" : ""}`}
            aria-selected={mode === "check"}
            role="tab"
            onClick={() => setMode("check")}
          >
            かけたかチェック
          </button>
        </div>

        <div class="draw-filter-row">
          <input
            aria-label="かんじを さがす"
            class="draw-search-input"
            name="drawSearch"
            placeholder="漢字・よみ・meaning"
            type="search"
            value={query}
            onInput={(event) => {
              const input = event.currentTarget as HTMLInputElement;
              setQuery(input.value);
            }}
          />
          <select
            aria-label="けっかのかず"
            class="draw-result-count"
            value={String(resultLimit)}
            onChange={(event) => {
              const select = event.currentTarget as HTMLSelectElement;
              setResultLimit(Number(select.value) as (typeof RESULT_LIMITS)[number]);
            }}
          >
            {RESULT_LIMITS.map((limit) => (
              <option key={limit} value={String(limit)}>
                {limit}けん
              </option>
            ))}
          </select>
        </div>

        <div class="draw-grade-row" aria-label="学年">
          {EDUCATION_GRADES.map((grade) => (
            <button
              type="button"
              class={`draw-grade-chip${selectedGrades.includes(grade) ? " is-active" : ""}`}
              aria-pressed={selectedGrades.includes(grade)}
              key={grade}
              onClick={() => toggleGrade(grade)}
            >
              {grade}年
            </button>
          ))}
          <span class="draw-index-status">{indexStatus}</span>
        </div>

        {mode === "search" ? (
          <div class="draw-mode-pane" role="tabpanel">
            <div class="draw-action-row">
              <button type="button" class="draw-primary-btn" onClick={recognizeDrawing}>
                さがす
              </button>
              <span class="draw-status-text">{recognitionStatus}</span>
            </div>

            <ResultList
              emptyLabel={query ? "文字のけっかは ありません" : "かいて さがしてね"}
              entries={query ? textResults : []}
              candidates={query ? [] : visibleCandidates}
              onSelectTarget={selectTarget}
            />
          </div>
        ) : (
          <div class="draw-mode-pane" role="tabpanel">
            <div class="draw-target-row">
              <div class="draw-reference-card">
                {targetSvg && selectedTarget ? (
                  <ReferenceSvg className="draw-reference-svg" targetSvg={targetSvg} />
                ) : (
                  <div class="draw-reference-fallback">{selectedTarget?.kanji || "?"}</div>
                )}
                <div>
                  <div class="draw-reference-title">{selectedTarget?.kanji || "おてほん"}</div>
                  <div class="draw-reference-meta">
                    {selectedTarget ? `${selectedTarget.grade}年・${selectedTarget.strokeCount ?? "-"}かく` : "えらんでね"}
                  </div>
                </div>
              </div>
              <button type="button" class="draw-primary-btn" onClick={checkDrawing}>
                チェック
              </button>
            </div>

            <ResultList
              emptyLabel="おてほんを えらんでね"
              entries={textResults}
              candidates={[]}
              onSelectTarget={selectTarget}
              selectedKanji={selectedTarget?.kanji}
            />

            <ScoreSummary report={scoreReport} status={scoreStatus} />
          </div>
        )}
      </section>
    </div>
  );
}

function ResultList({
  candidates,
  emptyLabel,
  entries,
  onSelectTarget,
  selectedKanji,
}: {
  candidates: HydratedCandidate[];
  emptyLabel: string;
  entries: DrawSearchEntry[];
  onSelectTarget: (entry: DrawSearchEntry) => void;
  selectedKanji?: string;
}) {
  const resultItems = candidates.length
    ? candidates.map((candidate) => ({
      confidence: candidate.score,
      entry: candidate.entry,
      kanji: candidate.kanji,
      key: `${candidate.rank}:${candidate.kanji}`,
      rank: candidate.rank,
    }))
    : entries.map((entry, index) => ({
      confidence: null,
      entry,
      kanji: entry.kanji,
      key: entry.kanji,
      rank: index + 1,
    }));

  if (resultItems.length === 0) {
    return <div class="draw-empty-state">{emptyLabel}</div>;
  }

  return (
    <div class="draw-result-list">
      {resultItems.map((item) => (
        item.entry ? (
          <button
            type="button"
            class={`draw-result-item${item.kanji === selectedKanji ? " is-selected" : ""}`}
            key={item.key}
            onClick={() => onSelectTarget(item.entry)}
          >
            <span class="draw-result-rank">{item.rank}</span>
            <span class="draw-result-kanji">{item.kanji}</span>
            <span class="draw-result-meta">
              {item.entry.grade}年
              {item.confidence !== null ? `・${Math.round(item.confidence * 100)}%` : ""}
            </span>
          </button>
        ) : (
          <div class="draw-result-item is-muted" key={item.key}>
            <span class="draw-result-rank">{item.rank}</span>
            <span class="draw-result-kanji">{item.kanji}</span>
            <span class="draw-result-meta">
              {item.confidence !== null ? `${Math.round(item.confidence * 100)}%` : ""}
            </span>
          </div>
        )
      ))}
    </div>
  );
}

function ScoreSummary({
  report,
  status,
}: {
  report: ScoreReport | null;
  status: string;
}) {
  if (!report) {
    return <div class="draw-score-empty">{status}</div>;
  }

  return (
    <div class="draw-score-panel">
      <div class="draw-score-header">
        <span class="draw-score-kanji">{report.target.kanji}</span>
        <span class="draw-score-status">{report.status}</span>
        <span class="draw-score-value">{formatPercent(report.overall.score)}</span>
      </div>
      <div class="draw-score-grid">
        <ScoreMeter label="ぜんたい" score={report.overall.score} />
        <ScoreMeter label="線のばしょ" score={report.overall.precision} />
        <ScoreMeter label="ぬけ" score={report.overall.coverage} />
        <ScoreMeter label="さいごのかく" score={report.finalStroke?.score ?? 0} muted={!report.finalStroke} />
      </div>
      <div class="draw-room-grid" aria-label="よっつのへや">
        {report.quadrants.map((quadrant) => (
          <ScoreMeter key={quadrant.id} label={quadrant.label} score={quadrant.score} compact />
        ))}
      </div>
    </div>
  );
}

function ScoreMeter({
  compact = false,
  label,
  muted = false,
  score,
}: {
  compact?: boolean;
  label: string;
  muted?: boolean;
  score: number;
}) {
  const normalizedScore = muted ? 0 : Math.max(0, Math.min(1, score));

  return (
    <div class={`draw-score-meter${compact ? " is-compact" : ""}${muted ? " is-muted" : ""}`}>
      <div class="draw-score-meter-top">
        <span>{label}</span>
        <span>{muted ? "--" : formatPercent(normalizedScore)}</span>
      </div>
      <div class="draw-score-track" aria-hidden="true">
        <span class="draw-score-fill" style={`width: ${Math.round(normalizedScore * 100)}%`} />
      </div>
    </div>
  );
}

function ReferenceSvg({
  className,
  targetSvg,
}: {
  className: string;
  targetSvg: TargetSvg;
}) {
  return (
    <svg class={className} viewBox={targetSvg.viewBox} aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        {targetSvg.strokes.map((stroke) => (
          <path d={stroke.d} key={stroke.id || stroke.d} />
        ))}
      </g>
    </svg>
  );
}

function canvasPoint(event: PointerEvent, canvas: HTMLCanvasElement): DrawPoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
  };
}

function drawStrokes(context: CanvasRenderingContext2D, strokes: DrawStroke[], lineWidth: number) {
  context.save();
  context.strokeStyle = "#262626";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;

  strokes.forEach((stroke) => {
    if (stroke.points.length === 0) return;

    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);

    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index];
      context.lineTo(point.x, point.y);
    }

    if (stroke.points.length === 1) {
      context.lineTo(stroke.points[0].x + 0.1, stroke.points[0].y + 0.1);
    }

    context.stroke();
  });

  context.restore();
}

function createWorkCanvas(size: number) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

function rasterizeDrawStrokes(strokes: DrawStroke[], size = CANVAS_SIZE) {
  const canvas = createWorkCanvas(size);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  const scale = size / CANVAS_SIZE;
  context.setTransform(scale, 0, 0, scale, 0, 0);
  drawStrokes(context, strokes, DRAW_LINE_WIDTH);
  context.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

function normalizeStrokesForCanvas(
  strokes: DrawStroke[],
  outputSize: number,
  cropBounds?: RasterBounds,
): { bounds: RasterBounds; imageData: ImageDataLike; values: Float32Array } | null {
  const sourceCanvas = rasterizeDrawStrokes(strokes);
  const sourceContext = sourceCanvas.getContext("2d");
  if (!sourceContext) return null;

  const sourceImage = sourceContext.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  const bounds = cropBounds || findInkBoundsFromImageData(sourceImage);
  if (!bounds) return null;

  const side = Math.max(bounds.width, bounds.height) * 1.28;
  const sourceX = bounds.left + bounds.width / 2 - side / 2;
  const sourceY = bounds.top + bounds.height / 2 - side / 2;
  const outputCanvas = createWorkCanvas(outputSize);
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) return null;

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputSize, outputSize);
  outputContext.imageSmoothingEnabled = true;
  outputContext.drawImage(sourceCanvas, sourceX, sourceY, side, side, 0, 0, outputSize, outputSize);

  const imageData = outputContext.getImageData(0, 0, outputSize, outputSize);
  return {
    bounds,
    imageData,
    values: imageDataToModelValues(imageData),
  };
}

function imageDataToModelValues(imageData: ImageDataLike) {
  const values = new Float32Array(imageData.width * imageData.height);

  for (let index = 0; index < values.length; index += 1) {
    const pixelIndex = index * 4;
    const red = imageData.data[pixelIndex] || 0;
    const green = imageData.data[pixelIndex + 1] || 0;
    const blue = imageData.data[pixelIndex + 2] || 0;
    const grayscale = red * 0.299 + green * 0.587 + blue * 0.114;
    values[index] = 255 - grayscale;
  }

  return values;
}

function renderTargetToImageData(targetSvg: TargetSvg, outputSize: number, strokeIndex: number | null = null): ImageDataLike {
  const canvas = createWorkCanvas(outputSize);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");

  const viewBox = parseViewBox(targetSvg.viewBox);
  const padding = outputSize * 0.1;
  const scale = (outputSize - padding * 2) / Math.max(viewBox.width, viewBox.height);

  context.save();
  context.translate(
    padding + (outputSize - padding * 2 - viewBox.width * scale) / 2 - viewBox.x * scale,
    padding + (outputSize - padding * 2 - viewBox.height * scale) / 2 - viewBox.y * scale,
  );
  context.scale(scale, scale);
  context.strokeStyle = "#000000";
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 4.5;

  const strokes = strokeIndex === null ? targetSvg.strokes : [targetSvg.strokes[strokeIndex]].filter(Boolean);
  strokes.forEach((stroke) => {
    context.stroke(new Path2D(stroke.d));
  });

  context.restore();
  return context.getImageData(0, 0, outputSize, outputSize);
}

function scoreFinalStroke(strokes: DrawStroke[], cropBounds: RasterBounds, targetSvg: TargetSvg) {
  if (strokes.length === 0 || targetSvg.strokes.length === 0) return null;

  const userFinal = normalizeStrokesForCanvas([strokes[strokes.length - 1]], SCORE_SIZE, cropBounds);
  if (!userFinal) return null;

  const targetFinal = renderTargetToImageData(targetSvg, SCORE_SIZE, targetSvg.strokes.length - 1);
  return compareBinaryMasks(
    imageDataToBinaryMask(userFinal.imageData),
    imageDataToBinaryMask(targetFinal),
    SCORE_SIZE,
    SCORE_SIZE,
    2,
  );
}

async function loadEducationSearchIndex(dataVersion: string) {
  try {
    const entries = await fetchCachedJson<DrawSearchEntry[]>(`/data/${dataVersion}/search-index.json`);
    return entries
      .filter((entry) => entry.kanji && isEducationGrade(entry.grade))
      .sort((a, b) => a.grade - b.grade || a.kanji.localeCompare(b.kanji, "ja"));
  } catch {
    // Older mirrored data may not have the compact search index yet.
  }

  const manifest = await fetchCachedJson<Manifest>(`/data/${dataVersion}/manifest.json`);
  const gradeKanji = EDUCATION_GRADES.flatMap((grade) => {
    return (manifest.grades[String(grade)] || []).map((kanji) => ({ grade, kanji }));
  });

  const entries = await mapWithConcurrency(gradeKanji, 16, async ({ grade, kanji }) => {
    const info = await fetchCachedJson<KanjiInfo>(`/data/${dataVersion}/info/${kanjiToHex(kanji)}.json`);
    return drawSearchEntryFromInfo({ ...info, grade: info.grade || grade });
  });

  return entries
    .filter((entry): entry is DrawSearchEntry => Boolean(entry))
    .sort((a, b) => a.grade - b.grade || a.kanji.localeCompare(b.kanji, "ja"));
}

async function fetchKanjiSvg(dataVersion: string, kanji: string) {
  return fetchCachedText(`/data/${dataVersion}/svg/${kanjiToHex(kanji)}.svg`);
}

async function createLocalTfliteProvider({
  labelsUrl,
  modelUrl,
  wasmBaseUrl,
}: {
  labelsUrl: string;
  modelUrl: string;
  wasmBaseUrl: string;
}): Promise<RecognitionProvider> {
  const { tf, tflite } = await loadTensorflowRuntime();

  tflite.setWasmPath(wasmBaseUrl);
  await tf.setBackend("cpu");
  await tf.ready();

  const [labelsText, modelBuffer] = await Promise.all([
    fetchCachedText(labelsUrl),
    fetchCachedArrayBuffer(modelUrl),
  ]);
  const labels = parseRecognizerLabels(labelsText);
  const model = await tflite.loadTFLiteModel(modelBuffer, { numThreads: 1 });

  return {
    id: "local-tflite",
    async recognize(input, limit) {
      const tensor = tf.tensor(input.values, [1, input.height, input.width, 1], "float32");
      const prediction = model.predict(tensor) as unknown;
      const outputTensor = firstPredictionTensor(prediction);
      const outputValues = Array.from(await outputTensor.data() as Float32Array);
      tensor.dispose();
      disposePrediction(prediction);

      return outputValues
        .map((score, index) => ({ index, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item, index) => ({
          kanji: labels[item.index] || "",
          rank: index + 1,
          score: item.score,
          source: "local-tflite" as const,
        }))
        .filter((candidate) => candidate.kanji);
    },
  };
}

async function loadTensorflowRuntime() {
  await loadRuntimeScript("/recognizer-wasm/tf-core.min.js");
  await loadRuntimeScript("/recognizer-wasm/tf-backend-cpu.min.js");
  await loadRuntimeScript("/recognizer-wasm/tf-tflite.min.js");

  if (!window.tf || !window.tflite) {
    throw new Error("モデルのランタイムを よめません");
  }

  return { tf: window.tf, tflite: window.tflite };
}

async function loadRuntimeScript(src: string) {
  const cachedPromise = runtimeScriptPromises.get(src);
  if (cachedPromise) return cachedPromise;

  const promise = new Promise<void>((resolve, reject) => {
    const existingScript = document.querySelector(`script[data-recognizer-runtime="${src}"]`);
    if (existingScript) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.dataset.recognizerRuntime = src;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("モデルのランタイムを よめません"));
    document.head.appendChild(script);
  });

  runtimeScriptPromises.set(src, promise);
  return promise;
}

function firstPredictionTensor(prediction: unknown): { data(): Promise<Float32Array | Int32Array | Uint8Array>; dispose(): void } {
  if (prediction && typeof prediction === "object" && "data" in prediction) {
    return prediction as ReturnType<typeof firstPredictionTensor>;
  }

  if (Array.isArray(prediction) && prediction[0]) {
    return prediction[0] as ReturnType<typeof firstPredictionTensor>;
  }

  if (prediction && typeof prediction === "object") {
    const first = Object.values(prediction)[0];
    if (first) return first as ReturnType<typeof firstPredictionTensor>;
  }

  throw new Error("モデルの出力を よめません");
}

function disposePrediction(prediction: unknown) {
  if (prediction && typeof prediction === "object" && "dispose" in prediction) {
    (prediction as { dispose(): void }).dispose();
    return;
  }

  if (Array.isArray(prediction)) {
    prediction.forEach((item) => item?.dispose?.());
    return;
  }

  if (prediction && typeof prediction === "object") {
    Object.values(prediction).forEach((item) => item?.dispose?.());
  }
}

function parseRecognizerLabels(labelsText: string) {
  const quotedLabels = [...labelsText.matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]);
  if (quotedLabels.length > 0) return quotedLabels;

  return [...labelsText.replace(/[\s,\[\]'"]/g, "")].filter(Boolean);
}

async function warmRecognizerCache(modelUrl: string, labelsUrl: string) {
  try {
    await Promise.all([
      fetchCachedText(labelsUrl),
      fetchCachedArrayBuffer(modelUrl),
    ]);
  } catch {
    // The hidden lab exposes the missing-asset state when the user opens it.
  }
}

async function fetchCachedJson<T>(url: string): Promise<T> {
  const text = await fetchCachedText(url, "application/json");
  return JSON.parse(text) as T;
}

async function fetchCachedText(url: string, accept = "text/plain") {
  const cached = await readCachedResponse(url);
  if (cached) return cached.text();

  const response = await fetch(url, { headers: { accept } });
  if (!response.ok) throw new Error(response.status === 503 ? "R2に モデルが ありません" : "データを よめません");
  await writeCachedResponse(url, response.clone());
  return response.text();
}

async function fetchCachedArrayBuffer(url: string) {
  const cached = await readCachedResponse(url);
  if (cached) return cached.arrayBuffer();

  const response = await fetch(url, { headers: { accept: "application/octet-stream" } });
  if (!response.ok) throw new Error(response.status === 503 ? "R2に モデルが ありません" : "モデルを よめません");
  await writeCachedResponse(url, response.clone());
  return response.arrayBuffer();
}

async function readCachedResponse(url: string) {
  if (!("caches" in window)) return null;
  const cache = await window.caches.open(CACHE_NAME);
  return cache.match(url);
}

async function writeCachedResponse(url: string, response: Response) {
  if (!("caches" in window)) return;
  const cache = await window.caches.open(CACHE_NAME);
  await cache.put(url, response);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }));

  return results;
}

function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)").matches || Boolean(window.navigator.standalone);
}

function formatPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
