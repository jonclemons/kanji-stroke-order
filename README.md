# かんじれんしゅう (Kanji Practice)

A 国語 tool for kids in Japanese public school. Built for iPad/desktop use.

**Live:** https://kokugo.app
**Worker Preview:** https://kanji-stroke-order.beepboopbop.workers.dev
**Domain:** kokugo.app
**Target runtime:** Cloudflare Workers + Honox

## Features

### Kanji Browser
- Grade browser (1年生〜6年生) with kanji grid
- Kanji lookup: readings (音読み/訓読み), grade, stroke count
- Grade-filtered vocabulary (words with kanji at or below student's grade)
- Native Honox path routing: URLs like `/grade/2/kanji/学`

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
- とめ・はね・はらい guidance during tracing

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

## Key Product Decisions

### Reading Display Rule
- We intentionally do **not** show every upstream reading by default.
- The goal is to keep readings short, predictable, and elementary-school friendly.
- On the main kanji detail view:
  - show up to `3` 訓読み
  - show up to `2` 音読み
- Near-duplicate readings are collapsed before display:
  - leading `-` is ignored
  - `.` is removed
  - 訓読み are deduped by their first `3` kana after cleaning
  - 音読み are deduped by exact cleaned value
- We keep the original upstream order, so the first/common readings stay first.
- Printable sheets use a looser but still bounded rule:
  - allow up to `6` 訓読み and `6` 音読み while selecting
  - then cap the total printable readings to `6` overall so the vertical table does not overflow the sheet

## Architecture

The app now runs as a **native Honox / Hono** app targeting **Cloudflare Workers** with SSR-first routes and browser-only islands where interactivity is needed.

```txt
app/routes/index.tsx                       — home page route
app/routes/grade/[grade]/index.tsx        — grade browse page
app/routes/grade/[grade]/kanji/[kanji]    — SSR kanji detail + islands
app/routes/about.tsx                      — app info page
app/routes/_renderer.tsx                  — HTML document renderer
app/components/AppShell.tsx               — shared SSR shell layout
app/components/KanjiSections.tsx          — SSR kanji detail sections
app/islands/PracticeAnimator.tsx          — animation / なぞる island
app/islands/PrintButton.tsx               — print action island
app/lib/                                  — data, routing, KanjiVG, trace, print helpers
app/server.ts                             — Hono server + /api/sheet endpoints
app/client.ts                             — native Honox client entry + service worker registration
app/style.css                             — global styles (including print)
src/version.js                            — app/data cache versioning
public/sw.js                              — service worker
public/manifest.json                      — PWA manifest
public/icon.svg                           — app icon
public/data/                              — mirrored kanji data served as static assets
```

### External APIs
- **KanjiVG** (GitHub raw) — SVG stroke data + stroke number positions
- **KanjiAPI** — kanji info, words, grade lists

### Storage
- IndexedDB `kanji-cache` v2: svg, info, words, grades, meta stores
- Service Worker cache: app shell files

## Development

```bash
# Clone
git clone git@github.com-jc:jonclemons/kanji-stroke-order.git
cd kanji-stroke-order

# Install deps
bun install

# Start the Honox dev server
bun run dev

# Run tests
bun run test

# Build for Cloudflare Workers
bun run build
```

To preview the built Worker locally after `bun run build`:

```bash
bun run preview
```

## Switchover

The repo is ready to move from Pages to Workers. The safest sequence is:

1. Add the Worker secrets:

```bash
bunx wrangler secret put READ_KEY
bunx wrangler secret put UPLOAD_KEY
```

2. Deploy the Worker to `workers.dev` first:

```bash
bun run deploy
```

3. Smoke-test the deployed Worker:

```bash
bun run smoke:worker -- https://<your-worker>.workers.dev
```

This checks:
- `/` returns HTML
- `/manifest.json` returns JSON
- `/data/v1/grades/grade-1.json` returns JSON
- `/api/health` returns the current app/data versions

4. After the Worker looks good, attach the production domains.

Cloudflare recommends **Custom Domains** when the Worker is the app origin. `kokugo.app` and `www.kokugo.app` should point directly at this Worker. If you later configure them in `wrangler.jsonc`, remember that custom-domain or route trigger changes may need `wrangler triggers deploy` when using version-upload flows. Sources: [GitHub Actions for Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [Workers versions and triggers](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)

There is a fuller operator checklist in [docs/SWITCHOVER.md](/Users/jonathanclemons/code/jc/kanji-stroke-order/docs/SWITCHOVER.md:1).

### GitHub Actions

The included workflow deploys on pushes to `master` after running tests. Add these repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `READ_KEY`
- `UPLOAD_KEY`

## Pending Work

See [GitHub Issues](https://github.com/jonclemons/kanji-stroke-order/issues) for current tasks.

### Priority: PDF Generation + R2 Caching
Generate actual landscape A4 PDFs (not browser print) using jsPDF + svg2pdf.js. Cache generated PDFs behind the main Hono app using Cloudflare R2.

**Tech stack:**
- jsPDF (~290KB) + svg2pdf.js (~100KB) via CDN
- Klee One font (Google Fonts, 教科書体-style) for Japanese text
- Cloudflare R2 (free tier: 10GB, 10M reads/month)
- Hono `/api/sheet/*` endpoints backed by Cloudflare R2

**Steps:**
1. Set up wrangler CLI + Cloudflare auth
2. Create the R2 bucket + bind it in `wrangler.jsonc`
3. Prepare Klee One font subset
4. Add CDN scripts + refactor SVG builder
5. New printPracticeSheet() with PDF gen + R2 caching

### Other Pending
- **kokugo.app domain** — connect to the Cloudflare Worker
- **ゆるキャラ mascot** — cute dragon character for UI/print sheets
- **読み書きの練習シート** — second printable sheet for reading/writing practice
- **Games** — Kanji Memory Match, Kanji Rain, Stroke Order Challenge, etc.
- **Trace mode polish** — short stroke skip edge cases
