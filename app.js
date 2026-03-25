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
const DB_VERSION = 1;
const DB_STORES = ["svg", "info", "words", "grades"];

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

// --- Print Practice Sheet (Japanese school style) ---

function printPracticeSheet() {
  const existing = document.querySelector(".print-sheet");
  if (existing) existing.remove();

  const info = currentKanjiInfo;
  const gradeNum = info?.grade || currentGrade || "";
  const strokeCount = info?.stroke_count || currentStrokes.length;
  const onReadings = info?.on_readings || [];
  const kunReadings = info?.kun_readings || [];

  const sheet = document.createElement("div");
  sheet.className = "print-sheet";

  // --- Top header bar ---
  const header = document.createElement("div");
  header.className = "ps-header";
  header.innerHTML = `
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
  `;
  sheet.appendChild(header);

  // --- Main content area ---
  const main = document.createElement("div");
  main.className = "ps-main";

  // LEFT: Practice grid (3 cols × 5 rows of writing cells)
  const leftSection = document.createElement("div");
  leftSection.className = "ps-left";

  // First row has the guide kanji in the first cell
  const practiceGrid = document.createElement("table");
  practiceGrid.className = "ps-practice-grid";
  const practiceRows = 5;
  const practiceCols = 3;
  for (let r = 0; r < practiceRows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < practiceCols; c++) {
      const td = document.createElement("td");
      td.className = "ps-cell";
      // First two cells get guide kanji (light gray)
      if (r === 0 && c < 2) {
        const guideSvg = createPrintGuideSVG(currentStrokes, "100%", currentViewBox, "#ccc");
        guideSvg.setAttribute("width", "100%");
        guideSvg.setAttribute("height", "100%");
        guideSvg.style.position = "absolute";
        guideSvg.style.top = "0";
        guideSvg.style.left = "0";
        td.appendChild(guideSvg);
      }
      tr.appendChild(td);
    }
    practiceGrid.appendChild(tr);
  }

  const practiceLabel = document.createElement("div");
  practiceLabel.className = "ps-vertical-label";
  practiceLabel.textContent = "くり返し書いておぼえよう";

  leftSection.appendChild(practiceGrid);
  leftSection.appendChild(practiceLabel);

  // CENTER: Stroke order step-by-step (3 large cells showing progressive strokes with numbers)
  const centerSection = document.createElement("div");
  centerSection.className = "ps-center";

  const strokeStepGrid = document.createElement("table");
  strokeStepGrid.className = "ps-stroke-steps";

  // Show 3 stages of stroke building
  const stepCount = currentStrokes.length;
  const stageIndices = [];
  if (stepCount <= 3) {
    for (let i = 0; i < stepCount; i++) stageIndices.push(i);
  } else {
    // Show ~3 evenly spaced stages plus the final
    const mid = Math.floor(stepCount / 2) - 1;
    stageIndices.push(mid);
    stageIndices.push(stepCount - 2);
    stageIndices.push(stepCount - 1);
  }

  for (const idx of stageIndices) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "ps-cell ps-stroke-cell";
    const svg = createPrintStepSVG(currentStrokes, idx, "100%", currentViewBox, true);
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.top = "0";
    svg.style.left = "0";
    td.appendChild(svg);
    tr.appendChild(td);
    strokeStepGrid.appendChild(tr);
  }

  const strokeLabel = document.createElement("div");
  strokeLabel.className = "ps-vertical-label";
  strokeLabel.textContent = "書きじゅんに気をつけて書いてみよう";

  centerSection.appendChild(strokeStepGrid);
  centerSection.appendChild(strokeLabel);

  // RIGHT: Large reference kanji with stroke numbers + info panel
  const rightSection = document.createElement("div");
  rightSection.className = "ps-right";

  // Large kanji with all stroke numbers (no highlight)
  const refBox = document.createElement("div");
  refBox.className = "ps-ref-kanji";
  const refSvg = createPrintRefSVG(currentStrokes, "100%", currentViewBox);
  refSvg.setAttribute("width", "100%");
  refSvg.setAttribute("height", "100%");
  refBox.appendChild(refSvg);
  rightSection.appendChild(refBox);

  // Stroke count
  const strokeInfo = document.createElement("div");
  strokeInfo.className = "ps-stroke-count";
  strokeInfo.textContent = `${strokeCount}画`;
  rightSection.appendChild(strokeInfo);

  // Readings table
  const readingTable = document.createElement("table");
  readingTable.className = "ps-reading-table";
  readingTable.innerHTML = `
    <tr><th colspan="2">読み方</th></tr>
    <tr>
      <td class="ps-reading-label">くん</td>
      <td class="ps-reading-label">音</td>
    </tr>
    <tr>
      <td class="ps-reading-value">${kunReadings.join("、") || "—"}</td>
      <td class="ps-reading-value">${onReadings.join("、") || "—"}</td>
    </tr>
  `;
  rightSection.appendChild(readingTable);

  main.appendChild(leftSection);
  main.appendChild(centerSection);
  main.appendChild(rightSection);
  sheet.appendChild(main);

  document.body.appendChild(sheet);
  window.print();
  // Remove print sheet after printing to prevent layout issues
  sheet.remove();
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
