const kanjiInput = document.getElementById("kanjiInput");
const lookupBtn = document.getElementById("lookupBtn");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const kanjiTitle = document.getElementById("kanjiTitle");
const readingsEl = document.getElementById("readings");
const wordsEl = document.getElementById("words");
const stepsGrid = document.getElementById("steps");
const animationCanvas = document.getElementById("animationCanvas");
const playBtn = document.getElementById("playBtn");
const resetBtn = document.getElementById("resetBtn");
const printBtn = document.getElementById("printBtn");
const kanjiGrid = document.getElementById("kanjiGrid");
const gradeButtons = document.querySelectorAll(".grade-btn");

let animationTimer = null;
let isPlaying = false;
let currentStrokePaths = [];
let currentKanji = "";
let currentStrokes = [];
let currentViewBox = "";
let currentGrade = null;
let currentKanjiInfo = null;

const gradeKanjiCache = {};
const kanjiInfoCache = {};
const svgCache = {};
const wordsCache = {};

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

// --- API ---

function kanjiToHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

async function fetchKanjiSVG(kanji) {
  if (svgCache[kanji]) return svgCache[kanji];
  const cached = await idbGet("svg", kanji);
  if (cached) { svgCache[kanji] = cached; return cached; }

  const hex = kanjiToHex(kanji);
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`「${kanji}」のデータがみつかりません`);
  const data = await resp.text();
  svgCache[kanji] = data;
  idbSet("svg", kanji, data);
  return data;
}

async function fetchKanjiInfo(kanji) {
  if (kanjiInfoCache[kanji]) return kanjiInfoCache[kanji];
  const cached = await idbGet("info", kanji);
  if (cached) { kanjiInfoCache[kanji] = cached; return cached; }

  const resp = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  kanjiInfoCache[kanji] = data;
  idbSet("info", kanji, data);
  return data;
}

async function fetchKanjiWords(kanji) {
  if (wordsCache[kanji]) return wordsCache[kanji];
  const cached = await idbGet("words", kanji);
  if (cached) { wordsCache[kanji] = cached; return cached; }

  const resp = await fetch(`https://kanjiapi.dev/v1/words/${encodeURIComponent(kanji)}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  wordsCache[kanji] = data;
  idbSet("words", kanji, data);
  return data;
}

async function fetchGradeKanji(grade) {
  if (gradeKanjiCache[grade]) return gradeKanjiCache[grade];
  const cached = await idbGet("grades", grade);
  if (cached) { gradeKanjiCache[grade] = cached; return cached; }

  const resp = await fetch(`https://kanjiapi.dev/v1/kanji/grade-${grade}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  gradeKanjiCache[grade] = data;
  idbSet("grades", grade, data);
  return data;
}

// --- SVG parsing ---

function parseStrokes(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const paths = doc.querySelectorAll("path");
  return Array.from(paths).map((p) => ({
    d: p.getAttribute("d"),
    id: p.getAttribute("id") || "",
  }));
}

function getViewBox(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
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
  vLine.setAttribute("stroke-width", "0.5");
  vLine.setAttribute("stroke-dasharray", "3 3");

  const hLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
  hLine.setAttribute("x1", x); hLine.setAttribute("y1", cy);
  hLine.setAttribute("x2", x + w); hLine.setAttribute("y2", cy);
  hLine.setAttribute("stroke", color);
  hLine.setAttribute("stroke-width", "0.5");
  hLine.setAttribute("stroke-dasharray", "3 3");

  svg.appendChild(vLine);
  svg.appendChild(hLine);
}

// --- Grade-appropriate word filtering ---
// Only show short, common words where ALL kanji are from the same grade or lower.

async function getGradeAppropriateWords(kanji, words, targetGrade) {
  if (!targetGrade) targetGrade = 6;

  const knownKanji = new Set();
  for (let g = 1; g <= targetGrade; g++) {
    const list = await fetchGradeKanji(g);
    list.forEach((k) => knownKanji.add(k));
  }

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

// --- Rendering ---

function renderReadings(info) {
  readingsEl.innerHTML = "";
  if (!info) {
    readingsEl.innerHTML = '<span style="color:#888">データなし</span>';
    return;
  }

  const groups = [];

  if (info.on_readings && info.on_readings.length > 0) {
    groups.push({ label: "音読み（おんよみ）", values: info.on_readings });
  }
  if (info.kun_readings && info.kun_readings.length > 0) {
    groups.push({ label: "訓読み（くんよみ）", values: info.kun_readings });
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
  addCrossGuide(svg, viewBox, "#2a3a4a");

  for (let i = 0; i <= upToStep; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", strokes[i].d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    if (i === upToStep) {
      path.setAttribute("stroke", "#e94560");
      path.setAttribute("stroke-width", "4.5");
    } else {
      path.setAttribute("stroke", "#556677");
      path.setAttribute("stroke-width", "3.5");
    }
    svg.appendChild(path);
  }

  for (let i = upToStep + 1; i < strokes.length; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", strokes[i].d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#2a3a4a");
    path.setAttribute("stroke-width", "2.5");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  }

  return svg;
}

// Add circled stroke numbers to an SVG, with collision avoidance
function addStrokeNumbers(svg, strokes, count) {
  const positions = [];
  const radius = 5;
  const minDist = 11; // minimum distance between number centers

  for (let i = 0; i < count; i++) {
    const d = strokes[i].d;
    const match = d.match(/^[Mm]\s*([\d.]+)[,\s]+([\d.]+)/);
    if (!match) continue;

    let x = parseFloat(match[1]);
    let y = parseFloat(match[2]);

    // Offset to place number slightly above-right of stroke start
    x += 4;
    y -= 4;

    // Push away from any existing number positions
    for (let attempt = 0; attempt < 8; attempt++) {
      let collision = false;
      for (const pos of positions) {
        const dx = x - pos.x;
        const dy = y - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          // Push in a spiral direction based on attempt
          const angle = (attempt * Math.PI) / 4;
          x = pos.x + Math.cos(angle) * minDist;
          y = pos.y + Math.sin(angle) * minDist;
          collision = true;
          break;
        }
      }
      if (!collision) break;
    }

    // Clamp within viewBox
    x = Math.max(radius + 1, Math.min(108 - radius, x));
    y = Math.max(radius + 1, Math.min(108 - radius, y));

    positions.push({ x, y });

    // White circle background
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x);
    circle.setAttribute("cy", y);
    circle.setAttribute("r", radius);
    circle.setAttribute("fill", "white");
    circle.setAttribute("stroke", "#e94560");
    circle.setAttribute("stroke-width", "0.8");
    svg.appendChild(circle);

    // Number text
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", x);
    text.setAttribute("y", y + 3);
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("font-size", "7");
    text.setAttribute("fill", "#e94560");
    text.setAttribute("font-family", "sans-serif");
    text.setAttribute("font-weight", "bold");
    text.textContent = i + 1;
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
      path.setAttribute("stroke", "#e94560");
      path.setAttribute("stroke-width", "4");
    } else {
      path.setAttribute("stroke", "#999");
      path.setAttribute("stroke-width", "3");
    }
    svg.appendChild(path);
  }

  if (showNumbers) {
    addStrokeNumbers(svg, strokes, upToStep + 1);
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

  addStrokeNumbers(svg, strokes, strokes.length);

  return svg;
}

function createAnimationSVG(strokes, viewBox) {
  const size = 180;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, viewBox, "#2a3a4a");

  strokes.forEach((stroke) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#556677");
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
  playBtn.textContent = "⏸";

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
      p.setAttribute("stroke", "#556677");
    });
    step = -1;
  }

  function nextStep() {
    if (step >= 0 && step < currentStrokePaths.length) {
      currentStrokePaths[step].setAttribute("stroke", "#556677");
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
          p.setAttribute("stroke", "#556677");
          p.setAttribute("stroke-width", "3.5");
        });
        step = -1;
        animationTimer = setTimeout(nextStep, 300);
      }, 1000);
      return;
    }
    const path = currentStrokePaths[step];
    path.style.opacity = "1";
    path.setAttribute("stroke", "#e94560");
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
  playBtn.textContent = "▶";
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
    p.setAttribute("stroke", "#556677");
    p.setAttribute("stroke-width", "3.5");
  });
}

// --- Interactive Stroke Tracing (なぞってみよう) ---

const traceArea = document.getElementById("traceArea");
const traceCanvas = document.getElementById("traceCanvas");
const traceCounter = document.getElementById("traceCounter");
const traceRetryBtn = document.getElementById("traceRetryBtn");
const traceMessage = document.getElementById("traceMessage");
const traceBtn = document.getElementById("traceBtn");

let isTracing = false;
let traceStrokeIndex = 0;
let traceProgress = 0;
let tracePaths = [];
let traceIsDrawing = false;
let traceSvgEl = null;

function enterTraceMode() {
  if (!currentStrokes.length) return;
  stopAnimation();
  isTracing = true;
  traceArea.classList.remove("hidden");
  traceMessage.classList.add("hidden");
  traceRetryBtn.classList.add("hidden");
  traceBtn.textContent = "▶";
  traceBtn.title = "アニメーション";
  buildTraceSVG();
}

function exitTraceMode() {
  isTracing = false;
  traceArea.classList.add("hidden");
  traceBtn.textContent = "✏";
  traceBtn.title = "なぞる";
}

function buildTraceSVG() {
  traceCanvas.innerHTML = "";
  const size = 240;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", currentViewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  addCrossGuide(svg, currentViewBox, "#2a3a4a");

  // Draw all strokes as faint guide
  currentStrokes.forEach((stroke) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", stroke.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#2a3a4a");
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
      path.setAttribute("stroke", "#e94560");
      const len = 0; // will set after append
      path.style.opacity = "1";
    } else {
      path.setAttribute("stroke", "#e94560");
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

function initTraceStroke(index) {
  if (index >= tracePaths.length) return;
  const path = tracePaths[index];
  path.style.opacity = "1";
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.style.transition = "none";
  traceProgress = 0;
}

function updateTraceCounter() {
  traceCounter.textContent = `${traceStrokeIndex + 1}/${currentStrokes.length}画め`;
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

function findNearestProgress(path, point, currentProgress) {
  const totalLen = path.getTotalLength();
  const searchStart = Math.max(0, currentProgress - 5);
  const searchEnd = Math.min(totalLen, currentProgress + 30);
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

function onTraceStart(e) {
  if (traceStrokeIndex >= tracePaths.length) return;
  e.preventDefault();
  traceIsDrawing = true;
  traceCanvas.classList.remove("error");
  onTraceMove(e);
}

function onTraceMove(e) {
  if (!traceIsDrawing || traceStrokeIndex >= tracePaths.length) return;
  e.preventDefault();

  const point = svgPoint(traceSvgEl, e.clientX, e.clientY);
  const path = tracePaths[traceStrokeIndex];
  const totalLen = path.getTotalLength();
  const TOLERANCE = 18; // SVG units (~25px on screen)

  const result = findNearestProgress(path, point, traceProgress);

  if (result.distance < TOLERANCE && result.length >= traceProgress) {
    // Valid: advance progress
    traceProgress = result.length;
    path.style.strokeDashoffset = totalLen - traceProgress;
    traceCanvas.classList.remove("error");

    // Check if stroke is complete (>90%)
    if (traceProgress / totalLen >= 0.9) {
      completeTraceStroke();
    }
  } else if (result.distance >= TOLERANCE) {
    // Too far from path
    traceCanvas.classList.add("error");
  }
}

function onTraceEnd(e) {
  traceIsDrawing = false;
}

function completeTraceStroke() {
  const path = tracePaths[traceStrokeIndex];
  path.style.transition = "stroke-dashoffset 0.15s ease";
  path.style.strokeDashoffset = "0";

  traceStrokeIndex++;
  traceProgress = 0;

  if (traceStrokeIndex >= tracePaths.length) {
    // All done!
    traceMessage.textContent = "よくできました！";
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

traceBtn.addEventListener("click", () => {
  if (isTracing) exitTraceMode();
  else enterTraceMode();
});

traceRetryBtn.addEventListener("click", retryTrace);

// --- Print Practice Sheet (Japanese school style) ---

function buildPrintSheetHTML() {
  const info = currentKanjiInfo;
  const gradeNum = info?.grade || currentGrade || "";
  const strokeCount = info?.stroke_count || currentStrokes.length;
  const onReadings = info?.on_readings || [];
  const kunReadings = info?.kun_readings || [];

  function svgToString(svgEl) {
    return new XMLSerializer().serializeToString(svgEl);
  }

  // Reference SVG — no stroke numbers, just the kanji with cross guide
  const refSvg = createPrintGuideSVG(currentStrokes, "100%", currentViewBox, "#333");
  refSvg.setAttribute("width", "100%");
  refSvg.setAttribute("height", "100%");

  // ALL stroke steps (every single stroke, not just 3 stages)
  const allStepSvgs = [];
  for (let i = 0; i < currentStrokes.length; i++) {
    const svg = createPrintStepSVG(currentStrokes, i, "100%", currentViewBox, true);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    allStepSvgs.push(svgToString(svg));
  }

  // Kakijun cells laid out vertically: top→bottom, right→left (tategaki flow)
  // We'll use a CSS grid with column-first flow
  const kakijunCells = allStepSvgs.map((svg, i) =>
    `<div class="ps-kakijun-cell"><div class="ps-kakijun-inner">${svg}</div><div class="ps-kakijun-num">${i + 1}</div></div>`
  ).join("");

  // Practice grid rows — all cells get cross guides via CSS ::before/::after
  let practiceRows = "";
  for (let r = 0; r < 5; r++) {
    let cells = "";
    for (let c = 0; c < 3; c++) {
      if (r === 0 && c < 2) {
        const g = createPrintGuideSVG(currentStrokes, "100%", currentViewBox, "#ccc");
        g.setAttribute("width", "100%");
        g.setAttribute("height", "100%");
        g.style.position = "absolute";
        g.style.top = "0";
        g.style.left = "0";
        cells += `<td class="ps-cell">${svgToString(g)}</td>`;
      } else {
        cells += `<td class="ps-cell"></td>`;
      }
    }
    practiceRows += `<tr>${cells}</tr>`;
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>漢字の練習 — ${currentKanji}</title>
<style>
  @page { size: landscape; margin: 8mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Meiryo", "Yu Gothic", sans-serif; }

  .ps-header {
    display: flex; align-items: center; gap: 1rem;
    margin-bottom: 8px; border-bottom: 3px solid #f5a623; padding-bottom: 6px;
  }
  .ps-grade-badge {
    background: #f48fb1; color: white; font-size: 1.1rem; font-weight: bold;
    padding: 4px 12px; border-radius: 6px; white-space: nowrap;
  }
  .ps-title { display: flex; flex-direction: column; }
  .ps-title-main { font-size: 1rem; font-weight: bold; color: #4caf50; }
  .ps-title-sub { font-size: 0.8rem; color: #666; }
  .ps-name-fields { margin-left: auto; display: flex; gap: 0.5rem; font-size: 0.9rem; }
  .ps-name-field { border-bottom: 1px solid #333; padding: 0 2rem 2px 0.3rem; }

  .ps-main { display: flex; gap: 8px; height: calc(100vh - 60px); }
  .ps-left { flex: 3; display: flex; gap: 4px; }
  .ps-right { flex: 2; display: flex; flex-direction: column; gap: 6px; }

  .ps-practice-grid {
    border-collapse: collapse; width: 100%; height: 100%; table-layout: fixed;
  }
  .ps-cell {
    border: 1px solid #aaa; position: relative; aspect-ratio: 1;
    padding: 0; vertical-align: middle; text-align: center;
  }
  .ps-cell::before, .ps-cell::after { content: ""; position: absolute; }
  .ps-cell::before { top: 0; bottom: 0; left: 50%; width: 1px; background: #d0e8ff; }
  .ps-cell::after { left: 0; right: 0; top: 50%; height: 1px; background: #d0e8ff; }
  .ps-cell svg { position: relative; z-index: 1; }

  .ps-vertical-label {
    writing-mode: vertical-rl; font-size: 0.7rem; color: #333;
    display: flex; align-items: center; justify-content: center;
    padding: 0 2px; white-space: nowrap;
  }

  /* Right panel: reference kanji + readings + kakijun */
  .ps-ref-kanji {
    border: 3px solid #f48fb1; border-radius: 8px;
    width: 100%; max-width: 120px; aspect-ratio: 1;
    display: flex; align-items: center; justify-content: center;
    padding: 6px; position: relative; margin: 0 auto;
  }
  .ps-ref-kanji svg { width: 100%; height: 100%; }
  .ps-stroke-count { text-align: center; font-size: 0.9rem; font-weight: bold; color: #333; }

  .ps-reading-table { border-collapse: collapse; width: 100%; font-size: 0.7rem; }
  .ps-reading-table th { background: #4fc3f7; color: white; padding: 2px 4px; text-align: center; font-size: 0.75rem; }
  .ps-reading-label { background: #e3f2fd; text-align: center; padding: 2px 4px; font-weight: bold; border: 1px solid #ccc; }
  .ps-reading-value { text-align: center; padding: 3px; border: 1px solid #ccc; color: #4fc3f7; font-size: 0.75rem; }

  /* Kakijun grid: vertical flow top→bottom, right→left */
  .ps-kakijun-label {
    font-size: 0.75rem; color: #333; font-weight: bold;
    margin: 4px 0 2px; text-align: center;
  }
  .ps-kakijun-grid {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(auto-fill, minmax(40px, 1fr));
    gap: 2px;
    direction: rtl;
    flex: 1;
    align-content: start;
  }
  .ps-kakijun-cell {
    direction: ltr;
    border: 1px solid #ddd;
    position: relative;
    aspect-ratio: 1;
    width: 100%;
  }
  .ps-kakijun-inner {
    position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  }
  .ps-kakijun-inner svg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  .ps-kakijun-num {
    position: absolute; bottom: 1px; right: 2px;
    font-size: 0.5rem; color: #999;
  }
</style>
</head>
<body>
  <div class="ps-header">
    <div class="ps-grade-badge">${gradeNum}年生</div>
    <div class="ps-title">
      <span class="ps-title-main">漢字をおぼえよう</span>
      <span class="ps-title-sub">漢字の練習</span>
    </div>
    <div class="ps-name-fields">
      <span class="ps-name-field">年</span>
      <span class="ps-name-field">組</span>
      <span class="ps-name-field">名前</span>
    </div>
  </div>

  <div class="ps-main">
    <div class="ps-left">
      <table class="ps-practice-grid">${practiceRows}</table>
      <div class="ps-vertical-label">くり返し書いておぼえよう</div>
    </div>

    <div class="ps-right">
      <div class="ps-ref-kanji">${svgToString(refSvg)}</div>
      <div class="ps-stroke-count">${strokeCount}画</div>
      <table class="ps-reading-table">
        <tr><th colspan="2">読み方</th></tr>
        <tr>
          <td class="ps-reading-label">くん</td>
          <td class="ps-reading-label">音</td>
        </tr>
        <tr>
          <td class="ps-reading-value">${kunReadings.join("、") || "—"}</td>
          <td class="ps-reading-value">${onReadings.join("、") || "—"}</td>
        </tr>
      </table>
      <div class="ps-kakijun-label">書きじゅん</div>
      <div class="ps-kakijun-grid">${kakijunCells}</div>
    </div>
  </div>

<script>window.onload = () => { window.print(); };</script>
</body>
</html>`;
}

function printPracticeSheet() {
  const html = buildPrintSheetHTML();
  const printWindow = window.open("", "_blank");
  printWindow.document.write(html);
  printWindow.document.close();
}

// --- Prefetching ---

function prefetchGradeInfo(kanjiList) {
  // Prefetch kanji info for all kanji in the grade during idle time
  let idx = 0;
  function next() {
    if (idx >= kanjiList.length) return;
    const batch = kanjiList.slice(idx, idx + 5);
    idx += 5;
    batch.forEach((k) => fetchKanjiInfo(k));
    if ("requestIdleCallback" in window) {
      requestIdleCallback(next);
    } else {
      setTimeout(next, 200);
    }
  }
  if ("requestIdleCallback" in window) {
    requestIdleCallback(next);
  } else {
    setTimeout(next, 200);
  }
}

function prefetchNeighbors(kanji, kanjiList) {
  // Prefetch SVG + words for adjacent kanji in the grid
  const idx = kanjiList.indexOf(kanji);
  if (idx === -1) return;
  const neighbors = [kanjiList[idx - 1], kanjiList[idx + 1]].filter(Boolean);
  neighbors.forEach((k) => {
    fetchKanjiSVG(k);
    fetchKanjiWords(k);
  });
}

// --- Offline grade download ---

const offlineBar = document.getElementById("offlineBar");
const downloadGradeBtn = document.getElementById("downloadGradeBtn");
const downloadStatus = document.getElementById("downloadStatus");

async function isGradeDownloaded(grade) {
  const meta = await idbGet("meta", `grade-${grade}`);
  return !!meta;
}

async function markGradeDownloaded(grade, count) {
  await idbSet("meta", `grade-${grade}`, { grade, count, downloadedAt: Date.now() });
}

async function updateGradeButtonMarks() {
  for (const btn of gradeButtons) {
    const grade = parseInt(btn.dataset.grade);
    const downloaded = await isGradeDownloaded(grade);
    btn.classList.toggle("downloaded", downloaded);
  }
}

async function downloadGradeForOffline(grade) {
  downloadGradeBtn.disabled = true;
  downloadStatus.textContent = "じゅんびちゅう...";

  const kanjiList = await fetchGradeKanji(grade);
  const total = kanjiList.length;
  let done = 0;

  // Process in batches of 5
  for (let i = 0; i < kanjiList.length; i += 5) {
    const batch = kanjiList.slice(i, i + 5);
    await Promise.all(batch.map(async (k) => {
      await Promise.all([fetchKanjiSVG(k), fetchKanjiInfo(k), fetchKanjiWords(k)]);
      done++;
      downloadStatus.textContent = `${done}/${total} ダウンロードちゅう...`;
    }));
  }

  await markGradeDownloaded(grade, total);
  downloadGradeBtn.disabled = false;
  downloadGradeBtn.textContent = "✓ オフラインOK";
  downloadGradeBtn.classList.add("downloaded");
  downloadStatus.textContent = "";
  updateGradeButtonMarks();
}

async function updateOfflineBar(grade) {
  offlineBar.classList.remove("hidden");
  const downloaded = await isGradeDownloaded(grade);
  if (downloaded) {
    downloadGradeBtn.textContent = "✓ オフラインOK";
    downloadGradeBtn.classList.add("downloaded");
  } else {
    downloadGradeBtn.textContent = "⬇ オフラインでつかう";
    downloadGradeBtn.classList.remove("downloaded");
  }
  downloadStatus.textContent = "";
}

downloadGradeBtn.addEventListener("click", () => {
  if (currentGrade) downloadGradeForOffline(currentGrade);
});

// Mark downloaded grades on load
updateGradeButtonMarks();

// --- Grade browsing ---

async function loadGrade(grade) {
  currentGrade = grade;
  gradeButtons.forEach((btn) => {
    btn.classList.toggle("active", parseInt(btn.dataset.grade) === grade);
  });

  kanjiGrid.innerHTML = '<span style="color:#888">よみこみちゅう...</span>';
  kanjiGrid.classList.remove("hidden");

  const kanjiList = await fetchGradeKanji(grade);

  kanjiGrid.innerHTML = "";
  kanjiList.forEach((k) => {
    const btn = document.createElement("button");
    btn.className = "kanji-grid-btn";
    btn.textContent = k;
    btn.addEventListener("click", () => {
      kanjiInput.value = k;
      lookup();
    });
    kanjiGrid.appendChild(btn);
  });

  // Prefetch info for all kanji in this grade during idle time
  prefetchGradeInfo(kanjiList);

  // Update offline download bar
  updateOfflineBar(grade);
}

// --- Main lookup ---

async function lookup() {
  const kanji = kanjiInput.value.trim();
  errorEl.textContent = "";
  resultsEl.classList.add("hidden");

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
  kanjiGrid.querySelectorAll(".kanji-grid-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.textContent === kanji);
  });

  // Show spinner
  const emptyState = document.getElementById("emptyState");
  if (emptyState) emptyState.classList.add("hidden");
  resultsEl.classList.add("hidden");
  let spinner = document.getElementById("loadingSpinner");
  if (!spinner) {
    spinner = document.createElement("div");
    spinner.id = "loadingSpinner";
    spinner.className = "loading-spinner";
    spinner.innerHTML = '<div class="spinner"></div>';
    document.querySelector(".main-content").appendChild(spinner);
  }
  spinner.classList.remove("hidden");

  try {
    const [svgText, kanjiInfo, kanjiWords] = await Promise.all([
      fetchKanjiSVG(kanji),
      fetchKanjiInfo(kanji),
      fetchKanjiWords(kanji),
    ]);

    const strokes = parseStrokes(svgText);
    const viewBox = getViewBox(svgText);

    if (strokes.length === 0) {
      throw new Error("かきじゅんデータがみつかりません");
    }

    const grade = kanjiInfo?.grade || currentGrade || 6;
    const filteredWords = await getGradeAppropriateWords(kanji, kanjiWords, grade);

    currentKanji = kanji;
    currentStrokes = strokes;
    currentViewBox = viewBox;
    currentKanjiInfo = kanjiInfo;

    kanjiTitle.textContent = kanji;
    renderReadings(kanjiInfo);
    renderWords(filteredWords);
    renderSteps(strokes, viewBox);
    setupAnimation(strokes, viewBox);
    resultsEl.classList.remove("hidden");
    const emptyState = document.getElementById("emptyState");
    if (emptyState) emptyState.classList.add("hidden");

    // Prefetch neighbors in the grade grid
    if (currentGrade && gradeKanjiCache[currentGrade]) {
      prefetchNeighbors(kanji, gradeKanjiCache[currentGrade]);
    }

    // Autoplay animation
    setTimeout(() => playAnimation(), 300);
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = "しらべる";
    const spinner = document.getElementById("loadingSpinner");
    if (spinner) spinner.classList.add("hidden");
  }
}

// --- Event listeners ---

lookupBtn.addEventListener("click", lookup);
kanjiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookup();
});

playBtn.addEventListener("click", () => {
  if (isPlaying) stopAnimation();
  else playAnimation();
});

resetBtn.addEventListener("click", resetAnimation);
printBtn.addEventListener("click", printPracticeSheet);

gradeButtons.forEach((btn) => {
  btn.addEventListener("click", () => loadGrade(parseInt(btn.dataset.grade)));
});
