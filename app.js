window.initLegacyApp = function initLegacyApp() {
if (window.__kanjiAppInitialized) return;
window.__kanjiAppInitialized = true;

const kanjiInput = document.getElementById("kanjiInput");
const lookupBtn = document.getElementById("lookupBtn");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const printViewEl = document.getElementById("printView");
const aboutViewEl = document.getElementById("aboutView");
const privacyViewEl = document.getElementById("privacyView");
const termsViewEl = document.getElementById("termsView");
const printPreviewSheetEl = document.getElementById("printPreviewSheet");
const printBackInlineBtn = document.getElementById("printBackInlineBtn");
const printNowInlineBtn = document.getElementById("printNowInlineBtn");
const readingsEl = document.getElementById("readings");
const wordsEl = document.getElementById("words");
const stepsGrid = document.getElementById("steps");
const animationCanvas = document.getElementById("animationCanvas");
const printBtn = document.getElementById("printBtn");
const modeToggleBtn = document.getElementById("modeToggleBtn");
const kanjiGrid = document.getElementById("kanjiGrid");
const gradeButtons = document.querySelectorAll(".grade-btn");
const appHeaderEyebrow = document.getElementById("appHeaderEyebrow");
const appHeaderTitle = document.getElementById("appHeaderTitle");
const appHeaderSubtitle = document.getElementById("appHeaderSubtitle");
const emptyStateEl = document.getElementById("emptyState");
const emptyStateMessage = document.getElementById("emptyStateMessage");
const footerActionsEl = document.getElementById("footerActions");
const footerMetaLinksEl = document.getElementById("footerMetaLinks");
const mainContentEl = document.querySelector(".main-content");

let animationTimer = null;
let isPlaying = false;
let currentStrokePaths = [];
let currentKanji = "";
let currentStrokes = [];
let currentStrokeNumbers = [];
let currentViewBox = "";
let currentGrade = null;
let currentKanjiInfo = null;
let currentScreen = "browse";
let infoReturnState = null;

const gradeKanjiCache = {};
const kanjiInfoCache = {};
const svgCache = {};
const wordsCache = {};
const inflightRequests = {
  svg: {},
  info: {},
  words: {},
  grades: {},
};
const knownKanjiByGradeCache = {};
const kanjiLoadState = {};
const kanjiGridButtons = new Map();
const kanjiPreloadTasks = new Map();
const gradeWarmPromises = {};
const gradeDownloadState = {};
const GRADE_YEARS = [1, 2, 3, 4, 5, 6];
const KANJI_PRELOAD_CONCURRENCY = 3;
const LOCAL_DATA_VERSION = "v1";

let kanjiPreloadQueue = [];
let activeKanjiPreloads = 0;
let currentGradeLoadId = 0;
let currentLookupId = 0;
let currentGridSelectionId = 0;
let gradeListWarmupStarted = false;

// --- IndexedDB persistent cache ---

const DB_NAME = "kanji-cache";
const DB_VERSION = 2;
const DB_STORES = ["svg", "info", "words", "grades", "meta"];

function openCacheDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      DB_STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, key) {
  try {
    const db = await openCacheDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch { return undefined; }
}

async function idbSet(storeName, key, value) {
  try {
    const db = await openCacheDB();
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
  } catch { /* silent */ }
}

function hasCacheEntry(cache, key) {
  return Object.prototype.hasOwnProperty.call(cache, key);
}

function runWhenIdle(callback) {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(() => callback());
  } else {
    setTimeout(callback, 200);
  }
}

async function getOrFetchCachedValue({ memoryCache, storeName, key, inflightCache, fetchValue }) {
  if (hasCacheEntry(memoryCache, key)) return memoryCache[key];
  if (inflightCache[key]) return inflightCache[key];

  inflightCache[key] = (async () => {
    const cached = await idbGet(storeName, key);
    if (cached !== undefined) {
      memoryCache[key] = cached;
      return cached;
    }

    const value = await fetchValue();
    memoryCache[key] = value;
    idbSet(storeName, key, value);
    return value;
  })();

  try {
    return await inflightCache[key];
  } finally {
    delete inflightCache[key];
  }
}

async function isGradeDownloaded(grade) {
  if (hasCacheEntry(gradeDownloadState, grade)) return gradeDownloadState[grade];

  const meta = await idbGet("meta", `grade-${grade}`);
  const downloaded = Boolean(meta);
  gradeDownloadState[grade] = downloaded;
  return downloaded;
}

// --- API ---

function kanjiToHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

function localDataUrl(kind, key) {
  return `/data/${LOCAL_DATA_VERSION}/${kind}/${key}`;
}

async function fetchMirroredResource({ localUrl, upstreamUrl, parseAs }) {
  if (localUrl) {
    try {
      const localResp = await fetch(localUrl, { cache: "force-cache" });
      if (localResp.ok) {
        return parseAs === "text" ? localResp.text() : localResp.json();
      }
      if (localResp.status !== 404) {
        throw new Error(`local mirror request failed: ${localResp.status}`);
      }
    } catch (error) {
      console.warn("Local mirror unavailable, falling back upstream", localUrl, error);
    }
  }

  const upstreamResp = await fetch(upstreamUrl);
  if (!upstreamResp.ok) {
    throw new Error(`upstream request failed: ${upstreamResp.status}`);
  }
  return parseAs === "text" ? upstreamResp.text() : upstreamResp.json();
}

async function fetchKanjiSVG(kanji) {
  return getOrFetchCachedValue({
    memoryCache: svgCache,
    storeName: "svg",
    key: kanji,
    inflightCache: inflightRequests.svg,
    fetchValue: async () => {
      const hex = kanjiToHex(kanji);
      return fetchMirroredResource({
        localUrl: localDataUrl("svg", `${hex}.svg`),
        upstreamUrl: `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`,
        parseAs: "text",
      });
    },
  });
}

async function fetchKanjiInfo(kanji) {
  return getOrFetchCachedValue({
    memoryCache: kanjiInfoCache,
    storeName: "info",
    key: kanji,
    inflightCache: inflightRequests.info,
    fetchValue: async () => {
      const hex = kanjiToHex(kanji);
      return fetchMirroredResource({
        localUrl: localDataUrl("info", `${hex}.json`),
        upstreamUrl: `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`,
        parseAs: "json",
      }).catch(() => null);
    },
  });
}

async function fetchKanjiWords(kanji) {
  return getOrFetchCachedValue({
    memoryCache: wordsCache,
    storeName: "words",
    key: kanji,
    inflightCache: inflightRequests.words,
    fetchValue: async () => {
      const hex = kanjiToHex(kanji);
      return fetchMirroredResource({
        localUrl: localDataUrl("words", `${hex}.json`),
        upstreamUrl: `https://kanjiapi.dev/v1/words/${encodeURIComponent(kanji)}`,
        parseAs: "json",
      }).catch(() => []);
    },
  });
}

async function fetchGradeKanji(grade) {
  return getOrFetchCachedValue({
    memoryCache: gradeKanjiCache,
    storeName: "grades",
    key: grade,
    inflightCache: inflightRequests.grades,
    fetchValue: async () => {
      return fetchMirroredResource({
        localUrl: localDataUrl("grades", `grade-${grade}.json`),
        upstreamUrl: `https://kanjiapi.dev/v1/kanji/grade-${grade}`,
        parseAs: "json",
      }).catch(() => []);
    },
  });
}

function isKanjiWarmReady(kanji) {
  return kanjiLoadState[kanji] === "ready"
    || (hasCacheEntry(svgCache, kanji)
      && hasCacheEntry(kanjiInfoCache, kanji)
      && hasCacheEntry(wordsCache, kanji));
}

function getKanjiLoadStatus(kanji) {
  if (isKanjiWarmReady(kanji)) return "ready";
  return kanjiLoadState[kanji] || "idle";
}

function updateKanjiGridButtonState(button, kanji) {
  const status = getKanjiLoadStatus(kanji);
  button.classList.toggle("is-queued", status === "queued");
  button.classList.toggle("is-loading", status === "loading");
  button.classList.toggle("is-ready", status === "ready");
  button.classList.toggle("is-error", status === "error");
  button.setAttribute("aria-busy", status === "loading" ? "true" : "false");
}

function setKanjiLoadStatus(kanji, status) {
  kanjiLoadState[kanji] = status;
  const button = kanjiGridButtons.get(kanji);
  if (button) updateKanjiGridButtonState(button, kanji);
}

function setActiveKanjiGridButton(activeKanji) {
  kanjiGridButtons.forEach((button, kanji) => {
    button.classList.toggle("active", kanji === activeKanji);
  });
}

async function warmKanjiData(kanji) {
  await Promise.all([
    fetchKanjiSVG(kanji),
    fetchKanjiInfo(kanji),
    fetchKanjiWords(kanji),
  ]);
}

function pumpKanjiPreloadQueue() {
  while (activeKanjiPreloads < KANJI_PRELOAD_CONCURRENCY && kanjiPreloadQueue.length) {
    const task = kanjiPreloadQueue.shift();
    if (!task || task.state !== "queued") continue;

    activeKanjiPreloads += 1;
    task.state = "loading";
    setKanjiLoadStatus(task.kanji, "loading");

    warmKanjiData(task.kanji)
      .then(() => {
        task.state = "ready";
        setKanjiLoadStatus(task.kanji, "ready");
        task.resolve();
      })
      .catch((err) => {
        task.state = "error";
        setKanjiLoadStatus(task.kanji, "error");
        task.reject(err);
      })
      .finally(() => {
        activeKanjiPreloads -= 1;
        kanjiPreloadTasks.delete(task.kanji);
        pumpKanjiPreloadQueue();
      });
  }
}

function queueKanjiWarm(kanji, { priority = false } = {}) {
  if (isKanjiWarmReady(kanji)) {
    setKanjiLoadStatus(kanji, "ready");
    return Promise.resolve();
  }

  let task = kanjiPreloadTasks.get(kanji);
  if (!task) {
    let resolveTask;
    let rejectTask;
    const promise = new Promise((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });

    task = {
      kanji,
      promise,
      resolve: resolveTask,
      reject: rejectTask,
      state: "queued",
    };
    kanjiPreloadTasks.set(kanji, task);
    kanjiPreloadQueue.push(task);
    setKanjiLoadStatus(kanji, "queued");
  } else if (priority && task.state === "queued") {
    kanjiPreloadQueue = [task, ...kanjiPreloadQueue.filter((item) => item !== task)];
  }

  pumpKanjiPreloadQueue();
  return task.promise;
}

async function warmGradeKanjiInOrder(grade, kanjiList) {
  if (await isGradeDownloaded(grade)) {
    kanjiList.forEach((kanji) => setKanjiLoadStatus(kanji, "ready"));
    return;
  }

  if (gradeWarmPromises[grade]) return gradeWarmPromises[grade];

  gradeWarmPromises[grade] = (async () => {
    const results = await Promise.allSettled(kanjiList.map((kanji) => queueKanjiWarm(kanji)));
    if (results.every((result) => result.status === "fulfilled")) {
      gradeDownloadState[grade] = true;
      await idbSet("meta", `grade-${grade}`, {
        grade,
        count: kanjiList.length,
        downloadedAt: Date.now(),
      });
    }
  })().finally(() => {
    delete gradeWarmPromises[grade];
  });

  return gradeWarmPromises[grade];
}

function startGradeListWarmupInYearOrder() {
  if (gradeListWarmupStarted) return;
  gradeListWarmupStarted = true;

  runWhenIdle(async () => {
    for (const grade of GRADE_YEARS) {
      try {
        await fetchGradeKanji(grade);
      } catch {
        // Keep the app interactive even if a background warmup request fails.
      }
    }
  });
}

// --- SVG parsing ---

function parseSVG(svgText) {
  const parser = new DOMParser();
  return parser.parseFromString(svgText, "image/svg+xml");
}

function parseStrokes(svgText) {
  const doc = parseSVG(svgText);
  const paths = doc.querySelectorAll("path");
  return Array.from(paths).map((p) => ({
    d: p.getAttribute("d"),
    id: p.getAttribute("id") || "",
  }));
}

function parseStrokeNumbers(svgText) {
  const doc = parseSVG(svgText);
  // KanjiVG stores stroke numbers in a group with id like "kvg:StrokeNumbers_XXXXX"
  const numGroup = doc.querySelector('[id^="kvg:StrokeNumbers"]');
  if (!numGroup) return [];
  const texts = numGroup.querySelectorAll("text");
  return Array.from(texts).map((t) => {
    const transform = t.getAttribute("transform") || "";
    // Parse "matrix(1 0 0 1 x y)" to extract x, y
    const match = transform.match(/matrix\([^)]*\s+([\d.]+)\s+([\d.]+)\)/);
    return {
      num: t.textContent,
      x: match ? parseFloat(match[1]) : 0,
      y: match ? parseFloat(match[2]) : 0,
    };
  });
}

function getViewBox(svgText) {
  const doc = parseSVG(svgText);
  const svg = doc.querySelector("svg");
  return svg?.getAttribute("viewBox") || "0 0 109 109";
}

// --- Cross guide (四つの部屋) ---

function addCrossGuide(svg, viewBox, color) {
  const parts = viewBox.split(/\s+/).map(Number);
  const x = parts[0], y = parts[1], w = parts[2], h = parts[3];
  const cx = x + w / 2, cy = y + h / 2;

  const vLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  vLine.setAttribute("x1", cx); vLine.setAttribute("y1", y);
  vLine.setAttribute("x2", cx); vLine.setAttribute("y2", y + h);
  vLine.setAttribute("stroke", color);
  vLine.setAttribute("stroke-width", "0.8");
  vLine.setAttribute("stroke-dasharray", "3 3");

  const hLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hLine.setAttribute("x1", x); hLine.setAttribute("y1", cy);
  hLine.setAttribute("x2", x + w); hLine.setAttribute("y2", cy);
  hLine.setAttribute("stroke", color);
  hLine.setAttribute("stroke-width", "0.8");
  hLine.setAttribute("stroke-dasharray", "3 3");

  svg.appendChild(vLine);
  svg.appendChild(hLine);
}

// --- Grade-appropriate word filtering ---
// Only show short, common words where ALL kanji are from the same grade or lower.

async function getGradeAppropriateWords(kanji, words, targetGrade) {
  if (!targetGrade) targetGrade = 6;

  const knownKanji = await getKnownKanjiForGrade(targetGrade);

  const filtered = words.filter((w) => {
    if (!w.variants || !w.variants.length || !w.meanings || !w.meanings.length) return false;
    const written = w.variants[0].written;
    if (!written) return false;
    // Keep short words only (1-3 characters) — age-appropriate
    if (written.length > 3) return false;
    // Every kanji must be known at this grade level
    for (const ch of written) {
      const code = ch.codePointAt(0);
      if (code >= 0x4e00 && code <= 0x9fff) {
        if (!knownKanji.has(ch)) return false;
      }
    }
    return true;
  });

  // Deduplicate by written form
  const seen = new Set();
  const unique = [];
  for (const w of filtered) {
    const written = w.variants[0].written;
    if (!seen.has(written)) {
      seen.add(written);
      unique.push(w);
    }
  }

  return unique.slice(0, 10);
}

async function getKnownKanjiForGrade(targetGrade) {
  if (knownKanjiByGradeCache[targetGrade]) return knownKanjiByGradeCache[targetGrade];

  const previousKnown = targetGrade > 1
    ? new Set(await getKnownKanjiForGrade(targetGrade - 1))
    : new Set();
  const currentGradeKanji = await fetchGradeKanji(targetGrade);
  currentGradeKanji.forEach((kanji) => previousKnown.add(kanji));
  knownKanjiByGradeCache[targetGrade] = previousKnown;
  return previousKnown;
}

// --- Rendering ---

function getReadingDisplaySets(info) {
  if (!info) {
    return {
      on: [],
      kun: [],
    };
  }

  const prioritizeReadings = (readings, { type, limit }) => {
    const seenRoots = new Set();
    const selected = [];

    readings.forEach((reading) => {
      if (!reading || selected.length >= limit) return;

      const cleaned = reading.replace(/^[\-]/, "").replace(/\./g, "");
      const root = type === "kun"
        ? cleaned.slice(0, Math.min(cleaned.length, 3))
        : cleaned;

      if (seenRoots.has(root)) return;
      seenRoots.add(root);
      selected.push(reading);
    });

    return selected;
  };

  return {
    // Keep the list short and predictable so elementary students see the core readings first.
    on: prioritizeReadings(info.on_readings || [], { type: "on", limit: 2 }),
    kun: prioritizeReadings(info.kun_readings || [], { type: "kun", limit: 3 }),
  };
}

function renderReadings(info) {
  readingsEl.innerHTML = "";
  if (!info) {
    readingsEl.innerHTML = '<span style="color:#888">データなし</span>';
    return;
  }

  const readingSets = getReadingDisplaySets(info);
  const groups = [];

  if (readingSets.kun.length > 0) {
    groups.push({ label: "訓読み（くんよみ）", values: readingSets.kun });
  }
  if (readingSets.on.length > 0) {
    groups.push({ label: "音読み（おんよみ）", values: readingSets.on });
  }
  if (info.grade) {
    const gradeLabel = info.grade <= 6
      ? `${info.grade}年生`
      : info.grade === 8 ? "中学校" : `${info.grade}`;
    groups.push({ label: "学年", values: [gradeLabel] });
  }
  if (info.stroke_count) {
    groups.push({ label: "画数", values: [`${info.stroke_count}画`] });
  }

  groups.forEach((g) => {
    const div = document.createElement("div");
    div.className = "reading-group";
    div.innerHTML = `
      <div class="label">${g.label}</div>
      <div class="values">${g.values.map((v) => `<span>${v}</span>`).join("")}</div>
    `;
    readingsEl.appendChild(div);
  });
}

function renderWords(words) {
  wordsEl.innerHTML = "";
  if (!words || words.length === 0) {
    wordsEl.innerHTML = '<span style="color:#888">ことばがみつかりません</span>';
    return;
  }

  words.forEach((w) => {
    const variant = w.variants[0];
    const card = document.createElement("div");
    card.className = "word-card";
    card.innerHTML = `
      <div class="word">${variant.written || variant.pronounced}</div>
      ${variant.pronounced ? `<div class="word-reading">${variant.pronounced}</div>` : ""}
    `;
    wordsEl.appendChild(card);
  });
}

function createStepSVG(strokes, upToStep, size, viewBox) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, viewBox, "#c0d0dc");

  for (let i = 0; i <= upToStep; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", strokes[i].d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (i === upToStep) {
      path.setAttribute("stroke", "#e8a0aa");
      path.setAttribute("stroke-width", "4.5");
    } else {
      path.setAttribute("stroke", "#a0b0bc");
      path.setAttribute("stroke-width", "3.5");
    }
    svg.appendChild(path);
  }

  for (let i = upToStep + 1; i < strokes.length; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", strokes[i].d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#d0dce6");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }

  return svg;
}

// Add circled stroke numbers to an SVG, with collision avoidance
// Add stroke numbers using KanjiVG's hand-curated positions
function addStrokeNumbers(svg, count) {
  for (let i = 0; i < count && i < currentStrokeNumbers.length; i++) {
    const sn = currentStrokeNumbers[i];
    const x = sn.x;
    const y = sn.y;

    // Small circle background
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y - 2);
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "white");
    circle.setAttribute("stroke", "#e8a0aa");
    circle.setAttribute("stroke-width", "0.6");
    circle.setAttribute("opacity", "0.9");
    svg.appendChild(circle);

    // Number text
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y + 1);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "7");
    text.setAttribute("fill", "#e8a0aa");
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "bold");
    text.textContent = sn.num;
    svg.appendChild(text);
  }
}

// Create SVG for print — with stroke number labels
function createPrintStepSVG(strokes, upToStep, size, viewBox, showNumbers) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, viewBox, "#d0e8ff");

  for (let i = 0; i <= upToStep; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", strokes[i].d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (i === upToStep) {
      path.setAttribute("stroke", "#e8a0aa");
      path.setAttribute("stroke-width", "4");
    } else {
      path.setAttribute("stroke", "#999");
      path.setAttribute("stroke-width", "3");
    }
    svg.appendChild(path);
  }

  if (showNumbers) {
    addStrokeNumbers(svg, upToStep + 1);
  }

  return svg;
}

// Full kanji SVG for print (all strokes, light gray for tracing guide)
function createPrintGuideSVG(strokes, size, viewBox, color) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, viewBox, "#d0e8ff");

  strokes.forEach((stroke) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", color);
    path.setAttribute("stroke-width", "3");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });

  return svg;
}

// Full kanji SVG for print reference — all strokes uniform color with stroke numbers
function createPrintRefSVG(strokes, size, viewBox) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, viewBox, "#d0e8ff");

  strokes.forEach((stroke) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#333");
    path.setAttribute("stroke-width", "3.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });

  addStrokeNumbers(svg, strokes.length);

  return svg;
}

function createAnimationSVG(strokes, viewBox) {
  const size = 240;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, viewBox, "#c0d0dc");

  strokes.forEach((stroke) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#a0b0bc");
    path.setAttribute("stroke-width", "3.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.style.opacity = "0";
    svg.appendChild(path);
  });

  return svg;
}

function renderSteps(strokes, viewBox) {
  stepsGrid.innerHTML = "";
  const stepSize = strokes.length > 12 ? 55 : strokes.length > 6 ? 65 : 75;

  for (let i = 0; i < strokes.length; i++) {
    const card = document.createElement("div");
    card.className = "step-card";
    const svg = createStepSVG(strokes, i, stepSize, viewBox);
    card.appendChild(svg);

    const label = document.createElement("div");
    label.className = "step-label";
    label.textContent = `${i + 1}/${strokes.length}`;
    card.appendChild(label);

    stepsGrid.appendChild(card);
  }
}

// --- Animation ---

function setupAnimation(strokes, viewBox) {
  stopAnimation();
  animationCanvas.innerHTML = "";
  const svg = createAnimationSVG(strokes, viewBox);
  animationCanvas.appendChild(svg);
  currentStrokePaths = Array.from(svg.querySelectorAll("path"));
}

function playAnimation() {
  if (isPlaying) return;
  isPlaying = true;
  // animation playing

  let step = -1;
  for (let i = 0; i < currentStrokePaths.length; i++) {
    if (currentStrokePaths[i].style.opacity === "0") {
      step = i - 1;
      break;
    }
  }
  if (step === -1) {
    currentStrokePaths.forEach((p) => {
      p.style.opacity = "0";
      p.setAttribute("stroke", "#a0b0bc");
    });
    step = -1;
  }

  function nextStep() {
    if (step >= 0 && step < currentStrokePaths.length) {
      currentStrokePaths[step].setAttribute("stroke", "#a0b0bc");
    }
    step++;
    if (step >= currentStrokePaths.length) {
      // Loop: reset all strokes and restart after a pause
      animationTimer = setTimeout(() => {
        currentStrokePaths.forEach((p) => {
          p.style.opacity = "0";
          p.style.transition = "none";
          p.style.strokeDashoffset = "0";
          p.style.strokeDasharray = "none";
          p.setAttribute("stroke", "#a0b0bc");
          p.setAttribute("stroke-width", "3.5");
        });
        step = -1;
        animationTimer = setTimeout(nextStep, 300);
      }, 1000);
      return;
    }
    const path = currentStrokePaths[step];
    path.style.opacity = "1";
    path.setAttribute("stroke", "#e8a0aa");
    path.setAttribute("stroke-width", "4.5");

    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.style.transition = `stroke-dashoffset ${getDrawDuration()}ms ease`;
    path.getBoundingClientRect();
    path.style.strokeDashoffset = "0";

    const delay = 150 + getDrawDuration();
    animationTimer = setTimeout(nextStep, delay);
  }
  nextStep();
}

function getDrawDuration() {
  return 280;
}

function stopAnimation() {
  isPlaying = false;
  // animation stopped
  if (animationTimer) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }
}

function resetAnimation() {
  stopAnimation();
  currentStrokePaths.forEach((p) => {
    p.style.opacity = "0";
    p.style.transition = "none";
    p.style.strokeDashoffset = "0";
    p.style.strokeDasharray = "none";
    p.setAttribute("stroke", "#a0b0bc");
    p.setAttribute("stroke-width", "3.5");
  });
}

// --- Interactive Stroke Tracing (なぞってみよう) ---

const traceArea = document.getElementById("traceArea");
const traceCanvas = document.getElementById("traceCanvas");
const traceCounter = document.getElementById("traceCounter");
const traceRetryBtn = document.getElementById("traceRetryBtn");
const traceMessage = document.getElementById("traceMessage");
// traceBtn removed — using modeToggleBtn instead

let isTracing = false;
let traceStrokeIndex = 0;
let traceProgress = 0;
let tracePaths = [];
let traceIsDrawing = false;
let traceSvgEl = null;
const TRACE_START_TOLERANCE = 15;
const TRACE_RESUME_TOLERANCE = 18;
const TRACE_PATH_TOLERANCE = 18;
const TRACE_COMPLETION_RATIO = 0.96;
const TRACE_END_TOLERANCE = 12;
const TRACE_MIN_PROGRESS_STEP = 1;
const TRACE_MIN_MOVE_COUNT = 6;

const animationWrap = document.getElementById("animationWrap");
const canvasTitle = document.getElementById("canvasTitle");

function enterTraceMode() {
  if (!currentStrokes.length) return;
  stopAnimation();
  isTracing = true;
  animationWrap.style.display = "none";
  traceArea.style.display = "";
  traceArea.classList.remove("hidden");
  canvasTitle.textContent = "なぞってみよう";
  traceMessage.classList.add("hidden");
  traceRetryBtn.classList.add("hidden");
  modeToggleBtn.textContent = "▶ アニメーション";
  buildTraceSVG();
}

function exitTraceMode() {
  isTracing = false;
  traceArea.style.display = "none";
  traceArea.classList.add("hidden");
  animationWrap.style.display = "";
  animationWrap.classList.remove("hidden");
  canvasTitle.textContent = "アニメーション";
  modeToggleBtn.textContent = "✏ なぞる";
  // Restart looping animation
  if (currentStrokes.length) {
    setupAnimation(currentStrokes, currentViewBox);
    playAnimation();
  }
}

function buildTraceSVG() {
  traceCanvas.innerHTML = "";
  const size = 240;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", currentViewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, currentViewBox, "#c0d0dc");

  // Draw all strokes as faint guide
  currentStrokes.forEach((stroke) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#d0dce6");
    path.setAttribute("stroke-width", "3.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });

  // Draw interactive stroke paths (initially hidden, revealed as user traces)
  tracePaths = [];
  currentStrokes.forEach((stroke, i) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("stroke-width", "4");
    if (i === 0) {
      // First stroke: show as dashed outline to trace
      path.setAttribute("stroke", "#e8a0aa");
      const len = 0; // will set after append
      path.style.opacity = "1";
    } else {
      path.setAttribute("stroke", "#e8a0aa");
      path.style.opacity = "0";
    }
    svg.appendChild(path);
    tracePaths.push(path);
  });

  traceCanvas.appendChild(svg);
  traceSvgEl = svg;

  // Initialize first stroke
  traceStrokeIndex = 0;
  traceProgress = 0;
  initTraceStroke(0);
  updateTraceCounter();

  // Add pointer events
  svg.addEventListener("pointerdown", onTraceStart);
  svg.addEventListener("pointermove", onTraceMove);
  svg.addEventListener("pointerup", onTraceEnd);
  svg.addEventListener("pointerleave", onTraceEnd);
}

function removeTraceHint() {
  const old = traceSvgEl?.querySelector(".trace-hint");
  if (old) old.remove();
}

function addTraceHint(path, index) {
  removeTraceHint();
  const startPt = path.getPointAtLength(0);
  const dirPt = path.getPointAtLength(Math.min(12, path.getTotalLength()));
  const angle = Math.atan2(dirPt.y - startPt.y, dirPt.x - startPt.x);

  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
  g.setAttribute("class", "trace-hint");

  // Pulsing circle at start
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", startPt.x);
  circle.setAttribute("cy", startPt.y);
  circle.setAttribute("r", "7");
  circle.setAttribute("fill", "rgba(76, 175, 80, 0.3)");
  circle.setAttribute("stroke", "#7aaa7e");
  circle.setAttribute("stroke-width", "1.2");
  g.appendChild(circle);

  // Stroke number
  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", startPt.x);
  text.setAttribute("y", startPt.y + 3.5);
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("font-size", "8");
  text.setAttribute("fill", "#7aaa7e");
  text.setAttribute("font-family", "sans-serif");
  text.setAttribute("font-weight", "bold");
  text.textContent = index + 1;
  g.appendChild(text);

  // Direction arrow
  const arrowLen = 10;
  const ax = startPt.x + Math.cos(angle) * 14;
  const ay = startPt.y + Math.sin(angle) * 14;
  const arrow = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
  const tipX = ax + Math.cos(angle) * arrowLen;
  const tipY = ay + Math.sin(angle) * arrowLen;
  const lx = ax + Math.cos(angle + 2.5) * 5;
  const ly = ay + Math.sin(angle + 2.5) * 5;
  const rx = ax + Math.cos(angle - 2.5) * 5;
  const ry = ay + Math.sin(angle - 2.5) * 5;
  arrow.setAttribute("points", `${tipX},${tipY} ${lx},${ly} ${rx},${ry}`);
  arrow.setAttribute("fill", "#7aaa7e");
  g.appendChild(arrow);

  // Pulse animation via CSS
  circle.style.animation = "trace-pulse 1s ease-in-out infinite";

  traceSvgEl.appendChild(g);
}

function initTraceStroke(index) {
  if (index >= tracePaths.length) return;
  const path = tracePaths[index];
  path.style.opacity = "1";
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.style.transition = "none";
  traceProgress = 0;
  traceMoveCount = 0;
  traceStarted = false;
  traceIsDrawing = false;
  addTraceHint(path, index);
}

function updateTraceCounter() {
  traceCounter.textContent = `${traceStrokeIndex + 1}/${currentStrokes.length}画め`;
}

function pointDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function isNearPathLength(path, point, length, tolerance) {
  const clampedLength = Math.max(0, Math.min(path.getTotalLength(), length));
  const pathPoint = path.getPointAtLength(clampedLength);
  return pointDistance(point, pathPoint) < tolerance;
}

function svgPoint(svg, clientX, clientY) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const inv = ctm.inverse();
  return {
    x: inv.a * clientX + inv.c * clientY + inv.e,
    y: inv.b * clientX + inv.d * clientY + inv.f,
  };
}

let traceMoveCount = 0; // track number of moves in current stroke

function findNearestProgress(path, point, currentProgress) {
  const totalLen = path.getTotalLength();
  // Scale search window to stroke length — never jump more than 10% ahead
  const maxJump = Math.max(5, totalLen * 0.10);
  const searchStart = Math.max(0, currentProgress - 5);
  const searchEnd = Math.min(totalLen, currentProgress + maxJump);
  let bestDist = Infinity;
  let bestLen = currentProgress;
  const step = 1.5;

  for (let len = searchStart; len <= searchEnd; len += step) {
    const p = path.getPointAtLength(len);
    const dx = p.x - point.x;
    const dy = p.y - point.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestLen = len;
    }
  }

  return { distance: Math.sqrt(bestDist), length: bestLen };
}

let traceStarted = false; // has the user touched near the start of the current stroke?

function onTraceStart(e) {
  if (traceStrokeIndex >= tracePaths.length) return;
  e.preventDefault();
  traceIsDrawing = false;
  traceStarted = false;
  traceCanvas.classList.remove("error");
  const point = svgPoint(traceSvgEl, e.clientX, e.clientY);
  const path = tracePaths[traceStrokeIndex];

  // If already made progress on this stroke, allow continuing from where we left off
  if (traceProgress > 0) {
    if (isNearPathLength(path, point, traceProgress, TRACE_RESUME_TOLERANCE)) {
      traceStarted = true;
      traceIsDrawing = true;
    }
    return;
  }

  // Fresh stroke: check if finger is near the start point
  const startPt = path.getPointAtLength(0);
  const distToStart = pointDistance(point, startPt);

  if (distToStart < TRACE_START_TOLERANCE) {
    traceStarted = true;
    traceIsDrawing = true;
    traceMoveCount = 0;
    removeTraceHint();
  }
}

function onTraceMove(e) {
  if (!traceIsDrawing || !traceStarted || traceStrokeIndex >= tracePaths.length) return;
  e.preventDefault();

  const point = svgPoint(traceSvgEl, e.clientX, e.clientY);
  const path = tracePaths[traceStrokeIndex];
  const totalLen = path.getTotalLength();

  const result = findNearestProgress(path, point, traceProgress);

  if (result.distance < TRACE_PATH_TOLERANCE && result.length >= traceProgress) {
    const progressDelta = result.length - traceProgress;
    traceProgress = result.length;
    if (progressDelta >= TRACE_MIN_PROGRESS_STEP) {
      traceMoveCount++;
    }
    path.style.strokeDashoffset = totalLen - traceProgress;
    traceCanvas.classList.remove("error");

    const isNearStrokeEnd = isNearPathLength(path, point, totalLen, TRACE_END_TOLERANCE);
    if (
      traceProgress / totalLen >= TRACE_COMPLETION_RATIO
      && traceMoveCount >= TRACE_MIN_MOVE_COUNT
      && isNearStrokeEnd
    ) {
      completeTraceStroke();
    }
  } else if (result.distance >= TRACE_PATH_TOLERANCE) {
    traceCanvas.classList.add("error");
  }
}

function onTraceEnd(e) {
  traceIsDrawing = false;
  traceStarted = false;
}

function completeTraceStroke() {
  const path = tracePaths[traceStrokeIndex];
  path.style.transition = "stroke-dashoffset 0.15s ease";
  path.style.strokeDashoffset = "0";
  traceIsDrawing = false;
  traceStarted = false;
  traceMoveCount = 0;
  traceCanvas.classList.remove("error");

  traceStrokeIndex++;
  traceProgress = 0;

  if (traceStrokeIndex >= tracePaths.length) {
    // All done!
    traceMessage.textContent = "イエーイ！";
    traceMessage.classList.remove("hidden");
    traceRetryBtn.classList.remove("hidden");
    traceCounter.textContent = "";
  } else {
    // Next stroke
    setTimeout(() => {
      initTraceStroke(traceStrokeIndex);
      updateTraceCounter();
    }, 200);
  }
}

function retryTrace() {
  traceMessage.classList.add("hidden");
  traceRetryBtn.classList.add("hidden");
  buildTraceSVG();
}

if (modeToggleBtn) {
  modeToggleBtn.addEventListener("click", () => {
    if (isTracing) exitTraceMode();
    else enterTraceMode();
  });
}

if (traceRetryBtn) {
  traceRetryBtn.addEventListener("click", retryTrace);
}

function gradeLabel(grade) {
  return `${grade}ねんせい`;
}

function isInfoScreen(screen = currentScreen) {
  return screen === "about" || screen === "privacy" || screen === "terms";
}

function syncGradeButtons() {
  gradeButtons.forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.grade, 10) === currentGrade);
  });
}

function updateAppHeader() {
  let eyebrow = "こくごアプリ";
  let title = "かんじれんしゅう";
  let subtitle = "がくねんを えらんで かんじを さがそう";

  if (currentScreen === "print" && currentKanji) {
    eyebrow = "いんさつじゅんび";
    title = `${currentKanji} を いんさつ`;
    subtitle = "ぷれびゅーを みてから したの ぼたんを おしてね";
  } else if (currentScreen === "about") {
    eyebrow = "アプリの じょうほう";
    title = "このアプリについて";
    subtitle = "このアプリの ねがいと データのことを まとめています";
  } else if (currentScreen === "privacy") {
    eyebrow = "たいせつな おしらせ";
    title = "プライバシーポリシー";
    subtitle = "このアプリで あつかう じょうほうについて";
  } else if (currentScreen === "terms") {
    eyebrow = "たいせつな おしらせ";
    title = "利用規約";
    subtitle = "このアプリの つかいかたについて";
  } else if (currentScreen === "detail" && currentKanji) {
    eyebrow = currentGrade ? `${gradeLabel(currentGrade)} の かんじ` : "かんじの れんしゅう";
    title = `${currentKanji} の れんしゅう`;
    subtitle = "よみかた、ことば、かきじゅんを みてみよう";
  } else if (currentGrade) {
    eyebrow = `${gradeLabel(currentGrade)} の かんじ`;
    title = "かんじを えらぼう";
    subtitle = "したの ますから きになる かんじを おしてね";
  }

  appHeaderEyebrow.textContent = eyebrow;
  appHeaderTitle.textContent = title;
  appHeaderSubtitle.textContent = subtitle;
}

function updateEmptyState() {
  if (!emptyStateMessage) return;

  if (currentGrade) {
    emptyStateMessage.textContent = "したの ますから かんじを おしてね";
  } else {
    emptyStateMessage.textContent = "がくねんを えらんで かんじを おしてね";
  }
}

function renderFooterActions() {
  footerActionsEl.innerHTML = "";

  const actions = [];

  if (isInfoScreen()) {
    actions.push({
      label: infoReturnState ? "もどる" : "さいしょへ",
      variant: "secondary",
      onClick: () => {
        if (infoReturnState) {
          restoreFromInfoView();
        } else {
          showHomeView();
        }
      },
    });
  } else if (currentScreen === "print" && currentKanji) {
    actions.push({
      label: "かんじにもどる",
      variant: "secondary",
      onClick: () => showDetailView({ updateRoute: true }),
    });
    actions.push({
      label: "いんさつする",
      variant: "accent",
      onClick: printCurrentSheet,
    });
  } else if (currentScreen === "detail" && currentKanji) {
    actions.push({
      label: currentGrade ? "かんじいちらん" : "さいしょへ",
      variant: "secondary",
      onClick: () => {
        if (currentGrade) {
          showBrowseView({ updateRoute: true, expand: true });
        } else {
          showHomeView();
        }
      },
    });
    actions.push({
      label: "いんさつ",
      variant: "accent",
      onClick: openPrintPreview,
    });
  } else if (currentScreen === "browse" && currentGrade) {
    actions.push({
      label: "さいしょへ",
      variant: "secondary",
      onClick: showHomeView,
    });

    if (currentKanji && currentStrokes.length) {
      actions.push({
        label: "さいごのかんじ",
        variant: "primary",
        onClick: () => showDetailView({ updateRoute: true }),
      });
    }
  }

  actions.forEach(({ label, variant, onClick, disabled = false }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `app-footer-btn is-${variant}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    footerActionsEl.appendChild(button);
  });

  footerActionsEl.classList.toggle("is-empty", actions.length === 0);
}

function renderFooterMetaLinks() {
  footerMetaLinksEl.innerHTML = "";

  const links = [
    { screen: "about", label: "アプリについて" },
    { screen: "privacy", label: "プライバシーポリシー" },
    { screen: "terms", label: "利用規約" },
  ];

  links.forEach(({ screen, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-footer-meta-link";
    button.textContent = label;

    if (currentScreen === screen) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "page");
      button.disabled = true;
    } else {
      button.addEventListener("click", () => openInfoView(screen));
    }

    footerMetaLinksEl.appendChild(button);
  });
}

function syncAppShell() {
  const showDetail = currentScreen === "detail" && Boolean(currentKanji);
  const showPrint = currentScreen === "print" && Boolean(currentKanji);
  const showAbout = currentScreen === "about";
  const showPrivacy = currentScreen === "privacy";
  const showTerms = currentScreen === "terms";
  const showEmpty = currentScreen === "browse";

  resultsEl.classList.toggle("hidden", !showDetail);
  printViewEl.classList.toggle("hidden", !showPrint);
  aboutViewEl.classList.toggle("hidden", !showAbout);
  privacyViewEl.classList.toggle("hidden", !showPrivacy);
  termsViewEl.classList.toggle("hidden", !showTerms);
  emptyStateEl.classList.toggle("hidden", !showEmpty);
  document.body.classList.toggle("is-print-preview", showPrint);

  updateAppHeader();
  updateEmptyState();
  renderFooterActions();
  renderFooterMetaLinks();
}

function showBrowseView({ updateRoute = true, expand = false } = {}) {
  currentScreen = "browse";
  if (expand) expandSidebar();
  syncAppShell();
  if (updateRoute) updateHash();
}

function showDetailView({ updateRoute = true, collapse = false } = {}) {
  currentScreen = "detail";
  if (collapse) collapseSidebar();
  syncAppShell();
  if (updateRoute) updateHash();
}

function showPrintView({ updateRoute = true, collapse = true } = {}) {
  currentScreen = "print";
  if (collapse) collapseSidebar();
  syncAppShell();
  if (updateRoute) updateHash();
}

function captureCurrentViewState() {
  return {
    screen: currentScreen,
    grade: currentGrade,
    hasKanji: Boolean(currentKanji),
  };
}

function openInfoView(screen = "about", { updateRoute = true } = {}) {
  if (!isInfoScreen()) {
    infoReturnState = captureCurrentViewState();
  }

  currentScreen = screen;
  syncAppShell();
  if (updateRoute) updateHash();
}

function restoreFromInfoView() {
  const returnState = infoReturnState;
  infoReturnState = null;

  if (!returnState) {
    showHomeView();
    return;
  }

  currentGrade = returnState.grade;
  syncGradeButtons();

  if (returnState.screen === "print" && returnState.hasKanji) {
    showPrintView({ updateRoute: true, collapse: true });
  } else if (returnState.screen === "detail" && returnState.hasKanji) {
    showDetailView({ updateRoute: true });
  } else if (returnState.screen === "browse" && returnState.grade) {
    showBrowseView({ updateRoute: true, expand: true });
  } else {
    showHomeView();
  }
}

function showHomeView({ updateRoute = true } = {}) {
  currentGrade = null;
  currentScreen = "browse";
  infoReturnState = null;
  currentGradeLoadId += 1;
  currentLookupId += 1;
  currentGridSelectionId += 1;
  errorEl.textContent = "";
  kanjiGrid.classList.add("hidden");
  kanjiGrid.innerHTML = "";
  setActiveKanjiGridButton(null);
  syncGradeButtons();
  expandSidebar();
  syncAppShell();
  if (updateRoute) updateHash();
}

// --- Print Practice Sheet (Japanese school style) ---

function buildPrintSheetSVG() {
  const info = currentKanjiInfo;
  const readingSets = getReadingDisplaySets(info);
  const strokeCount = info?.stroke_count || currentStrokes.length;
  const onReadings = readingSets.on;
  const kunReadings = readingSets.kun;

  // Helper: embed kanji strokes scaled into a cell at (cx, cy, size)
  function strokePaths(cx, cy, size, color, strokeW, upTo) {
    const s = size / 109;
    let paths = "";
    const end = upTo !== undefined ? upTo + 1 : currentStrokes.length;
    for (let i = 0; i < end; i++) {
      const c = (upTo !== undefined && i === upTo) ? "#e8a0aa" : color;
      const w = (upTo !== undefined && i === upTo) ? strokeW * 1.1 : strokeW;
      paths += `<path d="${currentStrokes[i].d}" fill="none" stroke="${c}" stroke-width="${w / s}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx},${cy}) scale(${s})"/>`;
    }
    return paths;
  }

  // Helper: add KanjiVG stroke numbers to SVG template
  function strokeNumbersSVG(cx, cy, size, count) {
    const s = size / 109;
    let nums = "";
    for (let i = 0; i < count && i < currentStrokeNumbers.length; i++) {
      const sn = currentStrokeNumbers[i];
      const nx = cx + sn.x * s;
      const ny = cy + sn.y * s;
      const r = 1.5 * s * 109 / size; // scale radius relative to cell
      nums += `<circle cx="${nx}" cy="${ny - 0.5}" r="${Math.max(1.2, r)}" fill="white" stroke="#e8a0aa" stroke-width="0.15" opacity="0.9"/>`;
      nums += `<text x="${nx}" y="${ny + 0.3}" text-anchor="middle" font-size="${Math.max(1.5, 2 * s * 109 / size)}" fill="#e8a0aa" font-weight="bold">${sn.num}</text>`;
    }
    return nums;
  }

  // Helper: dashed cross guide inside a cell
  function crossGuide(cx, cy, size) {
    const half = size / 2;
    return `<line x1="${cx + half}" y1="${cy}" x2="${cx + half}" y2="${cy + size}" stroke="#d0c8c8" stroke-width="0.2" stroke-dasharray="1 1"/>` +
           `<line x1="${cx}" y1="${cy + half}" x2="${cx + size}" y2="${cy + half}" stroke="#d0c8c8" stroke-width="0.2" stroke-dasharray="1 1"/>`;
  }

  // Layout: invisible sixths grid — A4 landscape
  const W = 281, H = 194;
  const PRINT_SAFE_W = 280;
  const PRINT_SAFE_H = 193;
  const sixthW = W / 6; // ~46.8mm per sixth
  const margin = 2;

  // LEFT 4/6: Writing practice grid
  const leftW = sixthW * 4;
  const practiceCols = 5, practiceRows = 5;
  const cellSize = Math.min(
    Math.floor((leftW - margin * 2) / practiceCols),
    Math.floor((H - margin * 2) / practiceRows)
  );
  const gridX = margin;
  const gridY = margin + Math.floor((H - margin * 2 - practiceRows * cellSize) / 2); // vertically center

  // RIGHT 2/6: Reference kanji + kakijun
  const panelX = sixthW * 4;
  const panelW = sixthW * 2;
  const panelCenterX = panelX + panelW / 2;

  // Kakijun grid templates
  const n = currentStrokes.length;
  let kjMaxCols, kjMaxRows;
  if (n <= 4)       { kjMaxCols = 2; kjMaxRows = 2; }
  else if (n <= 9)  { kjMaxCols = 3; kjMaxRows = 3; }
  else if (n <= 12) { kjMaxCols = 4; kjMaxRows = 3; }
  else              { kjMaxCols = 5; kjMaxRows = 4; }

  let svg = "";

  // --- LEFT: 5×5 Practice Grid ---
  for (let r = 0; r < practiceRows; r++) {
    for (let c = 0; c < practiceCols; c++) {
      const cx = gridX + c * cellSize;
      const cy = gridY + r * cellSize;
      svg += `<rect x="${cx}" y="${cy}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#aaa" stroke-width="0.3"/>`;
      svg += crossGuide(cx, cy, cellSize);
      // Guide kanji in top-right 2 cells (tategaki)
      if (c === practiceCols - 1 && r < 2) {
        svg += strokePaths(cx + 1, cy + 1, cellSize - 2, "#ccc", 0.8);
      }
    }
  }

  // Consistent left/right edges for the entire right panel
  const contentL = panelX + 4;
  const contentR = panelX + panelW - 4;
  const contentW = contentR - contentL;

  // --- RIGHT: Reference kanji (top, large) ---
  const refSize = Math.min(contentW, 60);
  const refX = contentL + (contentW - refSize) / 2;
  const refY = margin + 2;

  svg += `<rect x="${refX}" y="${refY}" width="${refSize}" height="${refSize}" rx="3" fill="none" stroke="#e8a0aa" stroke-width="1"/>`;
  svg += crossGuide(refX, refY, refSize);
  svg += strokePaths(refX + 1.5, refY + 1.5, refSize - 3, "#333", 1.0);
  svg += strokeNumbersSVG(refX + 1.5, refY + 1.5, refSize - 3, currentStrokes.length);

  // Stroke count (hiragana)
  let rightY = refY + refSize + 5;
  svg += `<text x="${contentL + contentW / 2}" y="${rightY}" text-anchor="middle" font-size="3.5" fill="#333" font-weight="bold">${strokeCount}かく</text>`;

  // --- Vertical yomikata table (2 columns: くん / おん) ---
  rightY += 4;
  const headerH = 6;
  const colHeaderH = 6;
  const charSize = 3.5; // font size for readings
  const charH = 4.5; // vertical spacing per character
  const readingSpacing = 6; // horizontal spacing between readings

  // Calculate body height from longest reading
  const allReadings = [...kunReadings, ...onReadings];
  const maxLen = allReadings.reduce((max, r) => Math.max(max, r.length), 0);
  const readingsBodyH = Math.max(20, maxLen * charH + 8); // min 20mm, +8 for padding
  const totalReadingsH = headerH + colHeaderH + readingsBodyH;
  const colW = contentW / 2;
  const midX = contentL + colW;

  // Outer border
  svg += `<rect x="${contentL}" y="${rightY}" width="${contentW}" height="${totalReadingsH}" rx="2" fill="none" stroke="#9ec5a0" stroke-width="0.4"/>`;

  // Header: よみかた
  svg += `<text x="${contentL + contentW / 2}" y="${rightY + 4}" text-anchor="middle" font-size="2.5" fill="#9ec5a0" font-weight="bold">よみかた</text>`;
  svg += `<line x1="${contentL}" y1="${rightY + headerH}" x2="${contentR}" y2="${rightY + headerH}" stroke="#9ec5a0" stroke-width="0.3"/>`;

  // Column headers: くん | おん
  const colHeaderY = rightY + headerH;
  svg += `<rect x="${contentL}" y="${colHeaderY}" width="${colW}" height="${colHeaderH}" fill="none" stroke="#9ec5a0" stroke-width="0.3"/>`;
  svg += `<rect x="${midX}" y="${colHeaderY}" width="${colW}" height="${colHeaderH}" fill="none" stroke="#9ec5a0" stroke-width="0.3"/>`;
  svg += `<text x="${contentL + colW / 2}" y="${colHeaderY + 4}" text-anchor="middle" font-size="2.5" fill="#9ec5a0" font-weight="bold">くん</text>`;
  svg += `<text x="${midX + colW / 2}" y="${colHeaderY + 4}" text-anchor="middle" font-size="2.5" fill="#9ec5a0" font-weight="bold">おん</text>`;
  svg += `<line x1="${midX}" y1="${colHeaderY + colHeaderH}" x2="${midX}" y2="${rightY + totalReadingsH}" stroke="#9ec5a0" stroke-width="0.2"/>`;

  // Readings body — vertical text, right-to-left within each column
  const bodyY = colHeaderY + colHeaderH + 5; // top padding

  // Kun readings (left column)
  for (let r = 0; r < kunReadings.length; r++) {
    const reading = kunReadings[r];
    const rx = contentL + colW - 4 - r * readingSpacing;
    for (let c = 0; c < reading.length; c++) {
      svg += `<text x="${rx}" y="${bodyY + c * charH}" font-size="${charSize}" fill="#333" text-anchor="middle">${reading[c]}</text>`;
    }
  }

  // On readings (right column)
  for (let r = 0; r < onReadings.length; r++) {
    const reading = onReadings[r];
    const rx = midX + colW - 4 - r * readingSpacing;
    for (let c = 0; c < reading.length; c++) {
      svg += `<text x="${rx}" y="${bodyY + c * charH}" font-size="${charSize}" fill="#333" text-anchor="middle">${reading[c]}</text>`;
    }
  }

  rightY += totalReadingsH;

  // --- Kakijun (flows right after readings, left-to-right) ---
  rightY += 4;
  const kjAvailH = H - rightY - margin;
  const labelSpace = 5;
  // Size cells so the grid fills contentW exactly
  const kjCellSizeByW = (contentW - (kjMaxCols - 1) * 2) / kjMaxCols;
  const kjCellSizeByH = (kjAvailH / kjMaxRows) - labelSpace;
  const kjCellSize = Math.min(kjCellSizeByW, kjCellSizeByH);
  // Recalculate gap to distribute any leftover space evenly
  const kjGap = kjMaxCols > 1 ? (contentW - kjMaxCols * kjCellSize) / (kjMaxCols - 1) : 0;

  // Helper: full step SVG — previous (gray) + current (pink) + future (faint)
  function stepPaths(cx, cy, size, upToStep) {
    const s = size / 109;
    let paths = "";
    for (let i = 0; i < currentStrokes.length; i++) {
      let color, w;
      if (i < upToStep) {
        color = "#a0b0bc"; w = 0.6;
      } else if (i === upToStep) {
        color = "#e8a0aa"; w = 0.7;
      } else {
        color = "#d0dce6"; w = 0.45;
      }
      paths += `<path d="${currentStrokes[i].d}" fill="none" stroke="${color}" stroke-width="${w / s}" stroke-linecap="round" stroke-linejoin="round" transform="translate(${cx},${cy}) scale(${s})"/>`;
    }
    return paths;
  }

  // Kakijun grid — left-to-right, top-to-down
  for (let i = 0; i < n; i++) {
    const col = i % kjMaxCols;
    const row = Math.floor(i / kjMaxCols);
    const cx = contentL + col * (kjCellSize + kjGap);
    const cy = rightY + row * (kjCellSize + labelSpace);

    svg += `<rect x="${cx}" y="${cy}" width="${kjCellSize}" height="${kjCellSize}" rx="1.5" fill="none" stroke="#d0d8dc" stroke-width="0.25"/>`;
    svg += crossGuide(cx, cy, kjCellSize);
    svg += stepPaths(cx + 0.5, cy + 0.5, kjCellSize - 1, i);
    svg += `<text x="${cx + kjCellSize / 2}" y="${cy + kjCellSize + 3.5}" text-anchor="middle" font-size="2.2" fill="#7a7a7a">${i + 1}/${n}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${PRINT_SAFE_W}mm" height="${PRINT_SAFE_H}mm" font-family="'Hiragino Kaku Gothic ProN','Meiryo','Yu Gothic',sans-serif">
${svg}
</svg>`;
}

function openPrintPreview({ updateRoute = true } = {}) {
  if (!currentKanji || !currentStrokes.length) {
    errorEl.textContent = "いんさつする かんじが まだないよ";
    return false;
  }

  errorEl.textContent = "";
  printPreviewSheetEl.innerHTML = buildPrintSheetSVG();
  showPrintView({ updateRoute, collapse: true });
  return true;
}

function printCurrentSheet() {
  if (currentScreen !== "print") {
    const opened = openPrintPreview({ updateRoute: true });
    if (!opened) return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.print();
    });
  });
}

// --- Prefetching ---

function prefetchNeighbors(kanji, kanjiList) {
  // Prefetch adjacent kanji so stepping through a grade feels instant.
  const idx = kanjiList.indexOf(kanji);
  if (idx === -1) return;
  const neighbors = [kanjiList[idx - 1], kanjiList[idx + 1]].filter(Boolean);
  neighbors.forEach((k) => {
    queueKanjiWarm(k);
  });
}

// --- Grade browsing ---

async function loadGrade(grade, { updateRoute = true } = {}) {
  const loadId = ++currentGradeLoadId;
  errorEl.textContent = "";
  currentGrade = grade;
  syncGradeButtons();
  showBrowseView({ updateRoute, expand: true });

  kanjiGrid.innerHTML = '<span style="color:#888">よみこみちゅう...</span>';
  kanjiGrid.classList.remove("hidden");

  const kanjiList = await fetchGradeKanji(grade);
  if (loadId !== currentGradeLoadId) return;
  const gradeDownloaded = await isGradeDownloaded(grade);
  if (loadId !== currentGradeLoadId) return;

  kanjiGrid.innerHTML = "";
  kanjiGridButtons.clear();
  kanjiList.forEach((k) => {
    if (gradeDownloaded) kanjiLoadState[k] = "ready";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "kanji-grid-btn";
    btn.dataset.kanji = k;
    btn.setAttribute("aria-label", `${k} をひらく`);

    const char = document.createElement("span");
    char.className = "kanji-grid-char";
    char.textContent = k;
    btn.appendChild(char);

    btn.addEventListener("click", () => {
      void selectKanjiFromGrid(k, { collapse: true });
    });

    kanjiGridButtons.set(k, btn);
    updateKanjiGridButtonState(btn, k);
    kanjiGrid.appendChild(btn);
  });

  setActiveKanjiGridButton(currentKanji);
  warmGradeKanjiInOrder(grade, kanjiList);
}

// --- Main lookup ---

async function selectKanjiFromGrid(
  kanji,
  { collapse = false, screen = "detail", updateRoute = true } = {},
) {
  const selectionId = ++currentGridSelectionId;
  errorEl.textContent = "";
  setActiveKanjiGridButton(kanji);

  try {
    await queueKanjiWarm(kanji, { priority: true });
  } catch (err) {
    if (selectionId === currentGridSelectionId) {
      errorEl.textContent = err.message;
    }
    return;
  }

  if (selectionId !== currentGridSelectionId) return;

  kanjiInput.value = kanji;
  if (collapse) collapseSidebar();
  await lookup({ screen, updateRoute, collapse });
}

async function lookup({ screen = "detail", updateRoute = true, collapse = false } = {}) {
  const lookupId = ++currentLookupId;
  const kanji = kanjiInput.value.trim();
  errorEl.textContent = "";
  currentScreen = "browse";
  syncAppShell();

  if (!kanji) {
    errorEl.textContent = "漢字をいれてね";
    return;
  }
  if (kanji.length > 1) {
    errorEl.textContent = "漢字を一つだけいれてね";
    return;
  }

  lookupBtn.disabled = true;
  lookupBtn.textContent = "…";

  // Immediately highlight in grid
  setActiveKanjiGridButton(kanji);

  // Show spinner
  let spinner = document.getElementById("loadingSpinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "loadingSpinner";
    spinner.className = "loading-spinner";
    spinner.innerHTML = '<div class="spinner"></div>';
    mainContentEl.appendChild(spinner);
  }
  spinner.classList.remove("hidden");

  try {
    const [svgText, kanjiInfo, kanjiWords] = await Promise.all([
      fetchKanjiSVG(kanji),
      fetchKanjiInfo(kanji),
      fetchKanjiWords(kanji),
    ]);
    if (lookupId !== currentLookupId) return;

    const strokes = parseStrokes(svgText);
    const strokeNumbers = parseStrokeNumbers(svgText);
    const viewBox = getViewBox(svgText);

    if (strokes.length === 0) {
      throw new Error("かきじゅんデータがみつかりません");
    }

    const grade = kanjiInfo?.grade || currentGrade || 6;
    const filteredWords = await getGradeAppropriateWords(kanji, kanjiWords, grade);
    if (lookupId !== currentLookupId) return;

    currentKanji = kanji;
    currentStrokes = strokes;
    currentStrokeNumbers = strokeNumbers;
    currentViewBox = viewBox;
    currentKanjiInfo = kanjiInfo;

    renderReadings(kanjiInfo);
    renderWords(filteredWords);
    renderSteps(strokes, viewBox);
    // Reset to animation mode if in trace
    if (isTracing) exitTraceMode();
    setupAnimation(strokes, viewBox);
    animationWrap.style.display = "";
    traceArea.style.display = "none";

    if (screen === "print") {
      openPrintPreview({ updateRoute });
    } else {
      showDetailView({ updateRoute, collapse });
    }

    // Prefetch neighbors in the grade grid
    if (currentGrade && gradeKanjiCache[currentGrade]) {
      prefetchNeighbors(kanji, gradeKanjiCache[currentGrade]);
    }

    // Autoplay animation
    setTimeout(() => playAnimation(), 300);
  } catch (err) {
    if (lookupId === currentLookupId) {
      errorEl.textContent = err.message;
    }
  } finally {
    if (lookupId !== currentLookupId) return;
    lookupBtn.disabled = false;
    lookupBtn.textContent = "しらべる";
    const spinner = document.getElementById("loadingSpinner");
    if (spinner) spinner.classList.add("hidden");
  }
}

// --- Event listeners ---

lookupBtn.addEventListener("click", () => {
  currentGridSelectionId += 1;
  void lookup();
});
kanjiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    currentGridSelectionId += 1;
    void lookup();
  }
});

printBtn.addEventListener("click", openPrintPreview);
if (printBackInlineBtn) {
  printBackInlineBtn.addEventListener("click", () => {
    showDetailView({ updateRoute: true });
  });
}
if (printNowInlineBtn) {
  printNowInlineBtn.addEventListener("click", printCurrentSheet);
}

gradeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    void loadGrade(parseInt(btn.dataset.grade, 10));
  });
});

// --- Mobile sidebar toggle ---
const sidebarToggle = document.getElementById("sidebarToggle");
const sidebarContent = document.getElementById("sidebarContent");
const isMobile = () => window.innerWidth <= 768;

function collapseSidebar() {
  if (isMobile()) {
    sidebarContent.classList.add("collapsed");
    sidebarToggle.classList.remove("hidden");
    sidebarToggle.textContent = "▼ 漢字をえらぶ";
  }
}

function expandSidebar() {
  sidebarContent.classList.remove("collapsed");
  sidebarToggle.textContent = "▲ とじる";
}

sidebarToggle.addEventListener("click", () => {
  if (sidebarContent.classList.contains("collapsed")) {
    expandSidebar();
  } else {
    collapseSidebar();
  }
});

// --- Hash routing ---
function updateHash() {
  if (isInfoScreen()) {
    history.replaceState(null, "", `#${currentScreen}`);
    return;
  }

  const parts = [];
  if (currentGrade) {
    parts.push("grade", String(currentGrade));
  }
  if (currentKanji && (currentScreen === "detail" || currentScreen === "print")) {
    parts.push(encodeURIComponent(currentKanji));
  }
  if (currentScreen === "print" && currentKanji) {
    parts.push("print");
  }

  const basePath = `${window.location.pathname}${window.location.search}`;
  if (parts.length) {
    history.replaceState(null, "", "#" + parts.join("/"));
  } else {
    history.replaceState(null, "", basePath);
  }
}

async function loadFromHash() {
  const hash = window.location.hash.slice(1); // remove #
  if (!hash) {
    showHomeView({ updateRoute: false });
    return;
  }

  if (hash === "about" || hash === "data") {
    infoReturnState = null;
    openInfoView("about", { updateRoute: false });
    return;
  }

  if (hash === "privacy") {
    infoReturnState = null;
    openInfoView("privacy", { updateRoute: false });
    return;
  }

  if (hash === "terms") {
    infoReturnState = null;
    openInfoView("terms", { updateRoute: false });
    return;
  }

  const parts = hash.split("/").filter(Boolean);
  let cursor = 0;
  let grade = null;
  let kanjiMatch = "";
  let screen = "browse";

  if (parts[cursor] === "grade" && /^\d+$/.test(parts[cursor + 1] || "")) {
    grade = parseInt(parts[cursor + 1], 10);
    cursor += 2;
  }

  if (parts[cursor] && parts[cursor] !== "print") {
    try {
      kanjiMatch = decodeURIComponent(parts[cursor]);
    } catch {
      kanjiMatch = parts[cursor];
    }
    cursor += 1;
  }

  if (parts[cursor] === "print" && kanjiMatch) {
    screen = "print";
  } else if (kanjiMatch) {
    screen = "detail";
  }

  if (grade) {
    await loadGrade(grade, { updateRoute: false });
    if (kanjiMatch) {
      await selectKanjiFromGrid(kanjiMatch, {
        collapse: false,
        screen,
        updateRoute: false,
      });
    } else {
      showBrowseView({ updateRoute: false, expand: true });
    }
  } else if (kanjiMatch) {
    showHomeView({ updateRoute: false });
    kanjiInput.value = kanjiMatch;
    await lookup({ screen, updateRoute: false, collapse: false });
  } else {
    showHomeView({ updateRoute: false });
  }
}

window.addEventListener("hashchange", loadFromHash);
syncAppShell();
startGradeListWarmupInYearOrder();
loadFromHash();
};
