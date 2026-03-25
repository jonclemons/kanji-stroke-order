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
const speedSlider = document.getElementById("speedSlider");
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

// Cache for grade kanji lists and kanji info
const gradeKanjiCache = {};
const kanjiInfoCache = {};

// --- API ---

function kanjiToHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

async function fetchKanjiSVG(kanji) {
  const hex = kanjiToHex(kanji);
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`「${kanji}」のデータがみつかりません`);
  return await resp.text();
}

async function fetchKanjiInfo(kanji) {
  if (kanjiInfoCache[kanji]) return kanjiInfoCache[kanji];
  const resp = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`);
  if (!resp.ok) return null;
  const data = await resp.json();
  kanjiInfoCache[kanji] = data;
  return data;
}

async function fetchKanjiWords(kanji) {
  const resp = await fetch(`https://kanjiapi.dev/v1/words/${encodeURIComponent(kanji)}`);
  if (!resp.ok) return [];
  return await resp.json();
}

async function fetchGradeKanji(grade) {
  if (gradeKanjiCache[grade]) return gradeKanjiCache[grade];
  const resp = await fetch(`https://kanjiapi.dev/v1/kanji/grade-${grade}`);
  if (!resp.ok) return [];
  const data = await resp.json();
  gradeKanjiCache[grade] = data;
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
// Only show words where ALL kanji in the word are from the same grade or lower.
// This ensures kids only see words they can actually read.

async function getGradeAppropriateWords(kanji, words, targetGrade) {
  if (!targetGrade) targetGrade = 6; // default: show all elementary

  // Build a set of all kanji up to the target grade
  const knownKanji = new Set();
  for (let g = 1; g <= targetGrade; g++) {
    const list = await fetchGradeKanji(g);
    list.forEach((k) => knownKanji.add(k));
  }

  // Filter words: keep only those where every kanji in the word is in knownKanji
  const filtered = words.filter((w) => {
    if (!w.variants || !w.variants.length || !w.meanings || !w.meanings.length) return false;
    const written = w.variants[0].written;
    if (!written) return false;
    // Check each character — if it's a kanji (not kana), it must be in knownKanji
    for (const ch of written) {
      const code = ch.codePointAt(0);
      // CJK Unified Ideographs range
      if (code >= 0x4e00 && code <= 0x9fff) {
        if (!knownKanji.has(ch)) return false;
      }
    }
    return true;
  });

  return filtered.slice(0, 12);
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
  if (info.meanings && info.meanings.length > 0) {
    groups.push({ label: "いみ", values: info.meanings });
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

function createPrintStepSVG(strokes, upToStep, size, viewBox) {
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
      path.setAttribute("stroke", "#cc0000");
      path.setAttribute("stroke-width", "4.5");
    } else {
      path.setAttribute("stroke", "#333");
      path.setAttribute("stroke-width", "3.5");
    }
    svg.appendChild(path);
  }

  return svg;
}

function createAnimationSVG(strokes, viewBox) {
  const size = 250;
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
  const stepSize = strokes.length > 12 ? 90 : 120;

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
  playBtn.textContent = "⏸ いちじていし";

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
      stopAnimation();
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

    const speed = 11 - speedSlider.value;
    const delay = speed * 150 + getDrawDuration();
    animationTimer = setTimeout(nextStep, delay);
  }
  nextStep();
}

function getDrawDuration() {
  const speed = 11 - speedSlider.value;
  return speed * 80 + 200;
}

function stopAnimation() {
  isPlaying = false;
  playBtn.textContent = "▶ さいせい";
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

// --- Print ---

function printPracticeSheet() {
  const rows = parseInt(document.getElementById("practiceRows").value) || 6;
  const cols = parseInt(document.getElementById("practiceCols").value) || 8;
  const showGuide = document.getElementById("showGuide").checked;
  const showStrokeRef = document.getElementById("showStrokeRef").checked;

  const existing = document.querySelector(".print-sheet");
  if (existing) existing.remove();

  const sheet = document.createElement("div");
  sheet.className = "print-sheet";
  sheet.style.display = "none";

  const header = document.createElement("div");
  header.className = "print-header";
  header.innerHTML = `
    <div class="kanji-char">${currentKanji}</div>
    <div class="info">かきじゅんれんしゅう — ${currentStrokes.length}画</div>
  `;
  sheet.appendChild(header);

  if (showStrokeRef) {
    const ref = document.createElement("div");
    ref.className = "print-stroke-ref";
    const refSize = Math.min(50, Math.floor(600 / currentStrokes.length));
    for (let i = 0; i < currentStrokes.length; i++) {
      const svg = createPrintStepSVG(currentStrokes, i, refSize, currentViewBox);
      ref.appendChild(svg);
    }
    sheet.appendChild(ref);
  }

  const table = document.createElement("table");
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      if (r === 0 && c === 0 && showGuide) {
        td.innerHTML = `<span class="guide-kanji">${currentKanji}</span>`;
      }
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  sheet.appendChild(table);
  document.body.appendChild(sheet);
  window.print();
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
  lookupBtn.textContent = "よみこみちゅう...";

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

    // Determine the grade for word filtering
    const grade = kanjiInfo?.grade || currentGrade || 6;
    const filteredWords = await getGradeAppropriateWords(kanji, kanjiWords, grade);

    currentKanji = kanji;
    currentStrokes = strokes;
    currentViewBox = viewBox;

    kanjiTitle.textContent = kanji;
    renderReadings(kanjiInfo);
    renderWords(filteredWords);
    renderSteps(strokes, viewBox);
    setupAnimation(strokes, viewBox);
    resultsEl.classList.remove("hidden");
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = "しらべる";
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
