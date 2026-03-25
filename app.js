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

let animationTimer = null;
let isPlaying = false;
let currentStrokePaths = [];
let currentKanji = "";
let currentStrokes = [];
let currentViewBox = "";

// Convert kanji character to its Unicode code point as 5-digit hex
function kanjiToHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

// Fetch KanjiVG SVG data from GitHub
async function fetchKanjiSVG(kanji) {
  const hex = kanjiToHex(kanji);
  const url = `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Kanji "${kanji}" not found in KanjiVG database`);
  }
  return await resp.text();
}

// Fetch kanji info (readings, meanings) from kanjiapi.dev
async function fetchKanjiInfo(kanji) {
  const resp = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`);
  if (!resp.ok) return null;
  return await resp.json();
}

// Fetch common words for a kanji from kanjiapi.dev
async function fetchKanjiWords(kanji) {
  const resp = await fetch(`https://kanjiapi.dev/v1/words/${encodeURIComponent(kanji)}`);
  if (!resp.ok) return [];
  const words = await resp.json();
  // Return up to 12 most common words, prefer shorter entries
  return words
    .filter((w) => w.variants && w.variants.length > 0 && w.meanings && w.meanings.length > 0)
    .slice(0, 12);
}

// Parse SVG and extract individual stroke paths
function parseStrokes(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const paths = doc.querySelectorAll("path");
  return Array.from(paths).map((p) => ({
    d: p.getAttribute("d"),
    id: p.getAttribute("id") || "",
  }));
}

// Get the viewBox from the original SVG
function getViewBox(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  return svg?.getAttribute("viewBox") || "0 0 109 109";
}

// Render readings section
function renderReadings(info) {
  readingsEl.innerHTML = "";
  if (!info) {
    readingsEl.innerHTML = '<span style="color:#888">Reading data unavailable</span>';
    return;
  }

  const groups = [];

  if (info.on_readings && info.on_readings.length > 0) {
    groups.push({ label: "On'yomi", values: info.on_readings });
  }
  if (info.kun_readings && info.kun_readings.length > 0) {
    groups.push({ label: "Kun'yomi", values: info.kun_readings });
  }
  if (info.meanings && info.meanings.length > 0) {
    groups.push({ label: "Meaning", values: info.meanings });
  }
  if (info.grade) {
    groups.push({ label: "Grade", values: [`Grade ${info.grade}`] });
  }
  if (info.jlpt) {
    groups.push({ label: "JLPT", values: [`N${info.jlpt}`] });
  }
  if (info.stroke_count) {
    groups.push({ label: "Strokes", values: [`${info.stroke_count}`] });
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

// Render common words section
function renderWords(words) {
  wordsEl.innerHTML = "";
  if (!words || words.length === 0) {
    wordsEl.innerHTML = '<span style="color:#888">No word data available</span>';
    return;
  }

  words.forEach((w) => {
    const variant = w.variants[0];
    const meaning = w.meanings[0].glosses.join(", ");
    const card = document.createElement("div");
    card.className = "word-card";
    card.innerHTML = `
      <div class="word">${variant.written || variant.pronounced}</div>
      ${variant.pronounced ? `<div class="word-reading">${variant.pronounced}</div>` : ""}
      <div class="word-meaning">${meaning}</div>
    `;
    wordsEl.appendChild(card);
  });
}

// Create an SVG element showing strokes up to a given step
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

// Create an SVG for print (black strokes on white)
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

// Create animated SVG with stroke drawing effect
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

// Render step-by-step stroke cards
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

// Animation logic
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
  playBtn.textContent = "⏸ Pause";

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
  playBtn.textContent = "▶ Play";
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

// Print practice sheet
function printPracticeSheet() {
  const rows = parseInt(document.getElementById("practiceRows").value) || 6;
  const cols = parseInt(document.getElementById("practiceCols").value) || 8;
  const showGuide = document.getElementById("showGuide").checked;
  const showStrokeRef = document.getElementById("showStrokeRef").checked;

  // Remove any existing print sheet
  const existing = document.querySelector(".print-sheet");
  if (existing) existing.remove();

  const sheet = document.createElement("div");
  sheet.className = "print-sheet";
  sheet.style.display = "none";

  // Header
  const header = document.createElement("div");
  header.className = "print-header";
  header.innerHTML = `
    <div class="kanji-char">${currentKanji}</div>
    <div class="info">Stroke Order Practice — ${currentStrokes.length} strokes</div>
  `;
  sheet.appendChild(header);

  // Stroke order reference
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

  // Practice grid
  const table = document.createElement("table");
  for (let r = 0; r < rows; r++) {
    const tr = document.createElement("tr");
    for (let c = 0; c < cols; c++) {
      const td = document.createElement("td");
      // First cell of first row gets the guide kanji
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

// Main lookup
async function lookup() {
  const kanji = kanjiInput.value.trim();
  errorEl.textContent = "";
  resultsEl.classList.add("hidden");

  if (!kanji) {
    errorEl.textContent = "Please enter a kanji character.";
    return;
  }

  if (kanji.length > 1) {
    errorEl.textContent = "Please enter only one kanji character.";
    return;
  }

  lookupBtn.disabled = true;
  lookupBtn.textContent = "Loading...";

  try {
    // Fetch stroke data, readings, and words in parallel
    const [svgText, kanjiInfo, kanjiWords] = await Promise.all([
      fetchKanjiSVG(kanji),
      fetchKanjiInfo(kanji),
      fetchKanjiWords(kanji),
    ]);

    const strokes = parseStrokes(svgText);
    const viewBox = getViewBox(svgText);

    if (strokes.length === 0) {
      throw new Error("No stroke data found for this kanji.");
    }

    currentKanji = kanji;
    currentStrokes = strokes;
    currentViewBox = viewBox;

    kanjiTitle.textContent = kanji;
    renderReadings(kanjiInfo);
    renderWords(kanjiWords);
    renderSteps(strokes, viewBox);
    setupAnimation(strokes, viewBox);
    resultsEl.classList.remove("hidden");
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    lookupBtn.disabled = false;
    lookupBtn.textContent = "Show Strokes";
  }
}

// Event listeners
lookupBtn.addEventListener("click", lookup);
kanjiInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") lookup();
});

playBtn.addEventListener("click", () => {
  if (isPlaying) {
    stopAnimation();
  } else {
    playAnimation();
  }
});

resetBtn.addEventListener("click", resetAnimation);
printBtn.addEventListener("click", printPracticeSheet);
