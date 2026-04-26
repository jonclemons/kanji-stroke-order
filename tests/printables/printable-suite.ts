import { generatePrintSheetPdfBlob } from "../../app/lib/print-pdf";

export type PrintableWorksheetCase = {
  filename?: string;
  id: string;
  label?: string;
  metadata?: Record<string, number | string | null | undefined>;
  renderSvg: () => Promise<string> | string;
  sampleKeys?: string[];
  title: string;
};

export type PrintablePdfSuite = {
  id: string;
  loadCases: () => Promise<PrintableWorksheetCase[]>;
  name: string;
};

export type PrintablePdfSuiteSelection =
  | { mode: "full" }
  | { mode: "random"; sampleSize: number; seed: string }
  | { mode: "samples"; samples: string[] };

export type PrintablePdfSuiteOptions = {
  onProgress?: (progress: { done: number; failureCount: number; lastCaseId?: string; total: number }) => void;
  perCaseTimeoutMs?: number;
  progressEvery?: number;
  saveLimit?: number;
  saveSamples?: boolean;
  selection?: PrintablePdfSuiteSelection;
};

export type PrintablePdfSuiteSavedSample = {
  base64: string;
  bytes: number;
  filename: string;
  id: string;
  label?: string;
  metadata?: PrintableWorksheetCase["metadata"];
  title: string;
};

export type PrintablePdfSuiteFailure = {
  bytes?: number;
  error?: string;
  filename?: string;
  id: string;
  label?: string;
  metadata?: PrintableWorksheetCase["metadata"];
  pageCount?: number;
  title: string;
};

export type PrintablePdfSuiteResult = {
  averagePdfBytes: number;
  averageMs: number;
  count: number;
  failures: PrintablePdfSuiteFailure[];
  failureCount: number;
  maxPdfBytes: number;
  maxMs: number;
  medianPdfBytes: number;
  medianMs: number;
  minPdfBytes: number;
  minMs: number;
  p95Ms: number;
  savedSamples: PrintablePdfSuiteSavedSample[];
  selectedCaseIds: string[];
  selectedCaseIdsTruncated: boolean;
  selection: PrintablePdfSuiteSelection;
  suiteId: string;
  suiteName: string;
  totalCases: number;
  totalMs: number;
};

export async function runPrintablePdfSuite(
  suite: PrintablePdfSuite,
  options: PrintablePdfSuiteOptions = {},
): Promise<PrintablePdfSuiteResult> {
  const allCases = await suite.loadCases();
  const selection = options.selection || { mode: "full" };
  const selectedCases = selectCases(allCases, selection);
  const perCaseTimeoutMs = options.perCaseTimeoutMs ?? 30_000;
  const progressEvery = Math.max(1, options.progressEvery ?? 50);
  const saveLimit = options.saveLimit ?? (selection.mode === "full" ? 6 : Number.POSITIVE_INFINITY);
  const host = document.createElement("div");

  host.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;";
  document.body.append(host);

  const failures: PrintablePdfSuiteFailure[] = [];
  const savedSamples: PrintablePdfSuiteSavedSample[] = [];
  const timings: number[] = [];
  const sizes: number[] = [];
  const startedAt = performance.now();

  if (selectedCases.length === 0) {
    host.remove();
    return buildResult({
      allCases,
      failures: [{
        error: "No printable worksheet cases matched the selected test options.",
        id: selection.mode,
        title: selection.mode,
      }],
      savedSamples,
      selectedCases,
      selection,
      sizes,
      startedAt,
      suite,
      timings,
    });
  }

  for (let index = 0; index < selectedCases.length; index += 1) {
    const worksheet = selectedCases[index];

    try {
      const result = await withTimeout(
        runWorksheetCase(worksheet, host),
        perCaseTimeoutMs,
        `Timed out after ${perCaseTimeoutMs}ms while generating ${worksheet.id}.`,
      );

      timings.push(result.durationMs);
      sizes.push(result.bytes.byteLength);

      if (result.pageCount !== 1) {
        failures.push({
          bytes: result.bytes.byteLength,
          filename: worksheet.filename,
          id: worksheet.id,
          label: worksheet.label,
          metadata: worksheet.metadata,
          pageCount: result.pageCount,
          title: worksheet.title,
        });
      }

      if (options.saveSamples && savedSamples.length < saveLimit) {
        savedSamples.push({
          base64: await blobToBase64(result.blob),
          bytes: result.bytes.byteLength,
          filename: worksheet.filename || `${worksheet.title}.pdf`,
          id: worksheet.id,
          label: worksheet.label,
          metadata: worksheet.metadata,
          title: worksheet.title,
        });
      }
    } catch (error) {
      failures.push({
        error: error instanceof Error ? error.message : String(error),
        filename: worksheet.filename,
        id: worksheet.id,
        label: worksheet.label,
        metadata: worksheet.metadata,
        title: worksheet.title,
      });
    } finally {
      host.innerHTML = "";
    }

    if ((index + 1) % progressEvery === 0 || index + 1 === selectedCases.length) {
      options.onProgress?.({
        done: index + 1,
        failureCount: failures.length,
        lastCaseId: worksheet.id,
        total: selectedCases.length,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  host.remove();

  return buildResult({
    allCases,
    failures,
    savedSamples,
    selectedCases,
    selection,
    sizes,
    startedAt,
    suite,
    timings,
  });
}

async function runWorksheetCase(worksheet: PrintableWorksheetCase, host: HTMLElement) {
  const sheetSvg = await worksheet.renderSvg();
  host.innerHTML = sheetSvg;

  const svg = host.querySelector("svg");
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error("Generated worksheet markup did not include an SVG element.");
  }

  const itemStartedAt = performance.now();
  const blob = await generatePrintSheetPdfBlob(svg, worksheet.title);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const pageCount = countPdfPages(bytes);

  return {
    blob,
    bytes,
    durationMs: performance.now() - itemStartedAt,
    pageCount,
  };
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    task.then((value) => {
      window.clearTimeout(timeout);
      resolve(value);
    }, (error) => {
      window.clearTimeout(timeout);
      reject(error);
    });
  });
}

function buildResult({
  allCases,
  failures,
  savedSamples,
  selectedCases,
  selection,
  sizes,
  startedAt,
  suite,
  timings,
}: {
  allCases: PrintableWorksheetCase[];
  failures: PrintablePdfSuiteFailure[];
  savedSamples: PrintablePdfSuiteSavedSample[];
  selectedCases: PrintableWorksheetCase[];
  selection: PrintablePdfSuiteSelection;
  sizes: number[];
  startedAt: number;
  suite: PrintablePdfSuite;
  timings: number[];
}): PrintablePdfSuiteResult {
  const sortedTimings = [...timings].sort((a, b) => a - b);
  const sortedSizes = [...sizes].sort((a, b) => a - b);

  return {
    averagePdfBytes: Math.round(average(sortedSizes)),
    averageMs: Math.round(average(sortedTimings)),
    count: selectedCases.length,
    failures: failures.slice(0, 20),
    failureCount: failures.length,
    maxPdfBytes: sortedSizes.at(-1) || 0,
    maxMs: Math.round(sortedTimings.at(-1) || 0),
    medianPdfBytes: sortedSizes[Math.floor(sortedSizes.length / 2)] || 0,
    medianMs: Math.round(percentile(sortedTimings, 0.5)),
    minPdfBytes: sortedSizes[0] || 0,
    minMs: Math.round(sortedTimings[0] || 0),
    p95Ms: Math.round(percentile(sortedTimings, 0.95)),
    savedSamples,
    selectedCaseIds: selectedCases.slice(0, 50).map((worksheet) => worksheet.id),
    selectedCaseIdsTruncated: selectedCases.length > 50,
    selection,
    suiteId: suite.id,
    suiteName: suite.name,
    totalCases: allCases.length,
    totalMs: Math.round(performance.now() - startedAt),
  };
}

function selectCases(cases: PrintableWorksheetCase[], selection: PrintablePdfSuiteSelection) {
  if (selection.mode === "full") {
    return cases;
  }

  if (selection.mode === "samples") {
    const sampleSet = new Set(selection.samples.map(normalizeSampleKey));
    return cases.filter((worksheet) => getSampleKeys(worksheet).some((key) => sampleSet.has(normalizeSampleKey(key))));
  }

  return pickRandomCases(cases, selection.sampleSize, selection.seed);
}

function getSampleKeys(worksheet: PrintableWorksheetCase) {
  return [
    worksheet.id,
    worksheet.label,
    worksheet.title,
    worksheet.filename,
    ...(worksheet.sampleKeys || []),
    ...Object.values(worksheet.metadata || {}).map((value) => value == null ? "" : String(value)),
  ].filter(Boolean) as string[];
}

function pickRandomCases(cases: PrintableWorksheetCase[], sampleSize: number, seed: string) {
  const shuffled = [...cases];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, Math.max(0, Math.min(sampleSize, shuffled.length)));
}

function normalizeSampleKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function createSeededRandom(seed: string) {
  let state = hashSeed(seed);

  return () => {
    state = Math.imul(1664525, state) + 1013904223 >>> 0;
    return state / 0x100000000;
  };
}

function hashSeed(seed: string) {
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return sum(values) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.floor(values.length * p))] || 0;
}

function countPdfPages(bytes: Uint8Array) {
  const chunks = [];

  for (let index = 0; index < bytes.length; index += 32768) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + 32768)));
  }

  return (chunks.join("").match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
}

async function blobToBase64(blob: Blob) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read PDF blob."));
    reader.readAsDataURL(blob);
  });

  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
