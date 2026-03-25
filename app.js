const kanjiInput = document.getElementById("kanjiInput");
const lookupBtn = document.getElementById("lookupBtn");
const errorEl = document.getElementById("error");
const resultsEl = document.getElementById("results");
const kanjiTitle = document.getElementById("kanjiTitle");
const stepsGrid = document.getElementById("steps");
const animationCanvas = document.getElementById("animationCanvas");
const playBtn = document.getElementById("playBtn");
const resetBtn = document.getElementById("resetBtn");
const speedSlider = document.getElementById("speedSlider");

let animationTimer = null;
let isPlaying = false;
let currentStrokePaths = [];

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

// Create an SVG element showing strokes up to a given step
function createStepSVG(strokes, upToStep, size, viewBox) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);

  // Draw all strokes up to this step
  for (let i = 0; i <= upToStep; i++) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", strokes[i].d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");

    if (i === upToStep) {
      // Current stroke — highlighted
      path.setAttribute("stroke", "#e94560");
      path.setAttribute("stroke-width", "4.5");
    } else {
      // Previous strokes — dimmed
      path.setAttribute("stroke", "#556677");
      path.setAttribute("stroke-width", "3.5");
    }
    svg.appendChild(path);
  }

  // Draw future strokes as very faint guides
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

// Create animated SVG with stroke drawing effect
function createAnimationSVG(strokes, viewBox) {
  const size = 250;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", viewBox);
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);

  // All strokes start hidden
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

  // Find the first hidden stroke to resume from
  for (let i = 0; i < currentStrokePaths.length; i++) {
    if (currentStrokePaths[i].style.opacity === "0") {
      step = i - 1;
      break;
    }
  }
  if (step === -1) {
    // All visible — reset and start over
    currentStrokePaths.forEach((p) => {
      p.style.opacity = "0";
      p.setAttribute("stroke", "#556677");
    });
    step = -1;
  }

  function nextStep() {
    // Dim previous highlighted stroke
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

    // Animate the stroke drawing using dash offset
    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;
    path.style.transition = `stroke-dashoffset ${getDrawDuration()}ms ease`;

    // Force reflow then animate
    path.getBoundingClientRect();
    path.style.strokeDashoffset = "0";

    const speed = 11 - speedSlider.value; // invert: higher slider = faster
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
    const svgText = await fetchKanjiSVG(kanji);
    const strokes = parseStrokes(svgText);
    const viewBox = getViewBox(svgText);

    if (strokes.length === 0) {
      throw new Error("No stroke data found for this kanji.");
    }

    kanjiTitle.textContent = kanji;
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
