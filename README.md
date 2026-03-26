# かんじれんしゅう (Kanji Practice)

A 国語 tool for kids in Japanese public school. Built for iPad/desktop use.

**Live:** https://kanji-stroke-order.pages.dev
**Domain:** kokugo.app (setup in progress)

## Features

### Kanji Browser
- Grade browser (1年生〜6年生) with kanji grid
- Kanji lookup: readings (音読み/訓読み), grade, stroke count
- Grade-filtered vocabulary (words with kanji at or below student's grade)
- Hash routing: shareable URLs like `#grade/2/学`

### Stroke Animation
- Looping stroke-by-stroke animation (240px canvas)
- 四つの部屋 (four quadrant) cross guides on all kanji views
- KanjiVG hand-curated stroke number positions

### Interactive Tracing (なぞってみよう)
- Single toggle button swaps between animation and trace mode
- Numbered circle + direction arrow at stroke start
- Progressive stroke reveal via touch/mouse drag
- Proximity-based path following with short-stroke skip prevention
- Resume mid-stroke after lifting finger
- イエーイ！ completion message

### Practice Sheet (いんさつ)
- SVG-based A4 landscape layout with mm coordinates
- Sixths grid: left 4/6 writing practice, right 2/6 reference + kakijun
- 5×5 practice grid with dashed cross guides on every cell
- Guide kanji in top-right cells
- Large reference kanji with KanjiVG stroke numbers
- Vertical yomikata table (くん/おん columns)
- Adaptive kakijun grid (scales with stroke count)

### Offline / PWA
- Service Worker caches app shell
- 3-layer caching: in-memory → IndexedDB → network
- Silent background download when grade is accessed
- Prefetching: grade info on idle, neighbors on kanji select

### Design
- ゆるキャラ pastel stationery aesthetic
- Powder blue bg, cream cards, dusty mint primary, blush pink accent
- Collapsible sidebar on mobile

## Architecture

```
index.html          — single page app
style.css           — all styles including print
app.js              — all logic (~1300 lines)
sw.js               — service worker (app shell cache)
manifest.json       — PWA manifest
icon.svg            — app icon
```

### External APIs
- **KanjiVG** (GitHub raw) — SVG stroke data + stroke number positions
- **KanjiAPI** — kanji info, words, grade lists

### Storage
- IndexedDB `kanji-cache` v2: svg, info, words, grades, meta stores
- Service Worker cache: app shell files

## Development

No build tools. Open `index.html` in a browser or serve with any static server.

```bash
# Clone
git clone git@github.com-jc:jonclemons/kanji-stroke-order.git
cd kanji-stroke-order

# Serve locally
python -m http.server 8000
# or
npx serve .
```

Auto-deploys to Cloudflare Pages on push to `master`.

## Pending Work

See [GitHub Issues](https://github.com/jonclemons/kanji-stroke-order/issues) for current tasks.

### Priority: PDF Generation + R2 Caching
Generate actual landscape A4 PDFs (not browser print) using jsPDF + svg2pdf.js. Cache in Cloudflare R2 for instant re-access.

**Tech stack:**
- jsPDF (~290KB) + svg2pdf.js (~100KB) via CDN
- Klee One font (Google Fonts, 教科書体-style) for Japanese text
- Cloudflare R2 (free tier: 10GB, 10M reads/month)
- Cloudflare Worker as GET/PUT proxy

**Steps:**
1. Set up wrangler CLI + Cloudflare auth
2. Create R2 bucket + Worker
3. Prepare Klee One font subset
4. Add CDN scripts + refactor SVG builder
5. New printPracticeSheet() with PDF gen + R2 caching

### Other Pending
- **kokugo.app domain** — connect to Cloudflare Pages
- **ゆるキャラ mascot** — cute dragon character for UI/print sheets
- **読み書きの練習シート** — second printable sheet for reading/writing practice
- **Games** — Kanji Memory Match, Kanji Rain, Stroke Order Challenge, etc.
- **Trace mode polish** — short stroke skip edge cases
