# Claude Context for kanji-stroke-order

This file captures project context, user preferences, and working knowledge for Claude Code sessions.

## User Profile
- Two kids in Japanese public school: 年中 (preschool 4-5) and 二年生 (2nd grade elementary)
- Educational apps should be framed as 国語 (Japanese language arts), not foreign learner tools
- Use 教育漢字 grade levels, not JLPT
- UI and content should be in Japanese

## GitHub Setup
- Two GitHub accounts with per-folder SSH configs:
  - `code-jc/` → `jonclemons` account, SSH key `~/.ssh/id_ed25519_jc`, host alias `github.com-jc`
  - `code-jatb/` → `justanothertechbro` account, SSH key `~/.ssh/id_ed25519_jatb`, host alias `github.com-jatb`
- This repo uses the `jonclemons` account
- Same setup on both Windows and macOS dev environments

## Working Preferences
- **Clean commits**: one logical change per commit, never bundle unrelated changes
- **Plan before building**: use plan mode for non-trivial features
- **Test before moving on**: push and verify changes before starting next feature
- **Discuss before acting**: don't make large assumptions, ask first
- **All hiragana** for labels aimed at kids (よみかた not 読み方, かきじゅん not 書きじゅん, かく not 画)

## Project: kanji-stroke-order

### Live
- **URL:** https://kanji-stroke-order.pages.dev
- **Hosting:** Cloudflare Pages (auto-deploys from master)
- **Domain:** kokugo.app (purchased, not yet connected)

### Architecture
- Vanilla JS, no build tools — 3 files: `index.html`, `style.css`, `app.js`
- Service Worker (`sw.js`) caches app shell
- PWA manifest (`manifest.json`) + SVG icon
- External APIs: KanjiVG (GitHub raw SVGs), KanjiAPI (info/words/grades)
- IndexedDB `kanji-cache` v2 with stores: svg, info, words, grades, meta
- Silent background download of grade data when accessed

### Color Scheme — ゆるキャラ Pastel Stationery
```
--bg:        #d4e4ed   powder blue background
--bg-light:  #e8f0f5   lighter panel bg
--card:      #f5f0e8   cream/off-white cards
--sidebar:   #c8dce8   deeper blue sidebar
--mint:      #9ec5a0   dusty mint green (primary)
--pink:      #e8a0aa   blush pink (accent)
--yellow:    #e8d88c   pale butter yellow
--text:      #3a3a3a   dark text
--text-sub:  #7a7a7a   subdued text
--border:    #b8c8d4   soft border
```
SVG stroke colors:
- Current/active stroke: `#e8a0aa` (pink)
- Previous strokes: `#a0b0bc` (gray)
- Future/guide strokes: `#d0dce6` (very faint)
- Cross guides: `#c0d0dc` (screen), `#d0c8c8` (print dashed)
- Trace hint: `#7aaa7e` (muted green)

### Key Technical Decisions
- **SVG practice sheet**: entire print sheet is one SVG with mm coordinates (viewBox="0 0 281 194"), avoids all CSS print rendering quirks
- **Sixths grid layout**: left 4/6 = writing practice, right 2/6 = reference + kakijun
- **KanjiVG stroke numbers**: extracted from `kvg:StrokeNumbers_[hex]` group in SVG files — hand-curated positions, better than algorithmic collision avoidance
- **Trace mode**: uses `getPointAtLength()` + `stroke-dashoffset` for progressive reveal. Search window scaled to 10% of stroke length. Requires 6 move events + 50% progress before auto-complete. Must touch within 15 SVG units of start point for fresh strokes, but can resume mid-stroke after lifting finger.
- **Hash routing**: `#grade/2/学` format, updates on navigation, loads from hash on page load

### Practice Sheet SVG Template
- 5×5 practice grid (cells auto-sized to fit height)
- Guide kanji in top-right 2 cells (tategaki position)
- Reference kanji: large, with KanjiVG stroke numbers, pink border
- Stroke count in hiragana: "○かく"
- Vertical yomikata table: くん/おん columns, readings top-to-bottom right-to-left
- Adaptive kakijun templates based on stroke count:
  - ≤4: 2×2 grid, ≤9: 3×3, ≤12: 4×3, 13+: 5×4
  - Cell size auto-calculated to fill available space
  - Flows left-to-right, top-to-down (matching webapp view)
  - Step labels "1/8" below each cell

### Pending: PDF Generation + R2 Caching (Issues #1-#4)
Browser print doesn't reliably set landscape. Plan: generate real PDFs.
- **jsPDF + svg2pdf.js** via CDN (~390KB total)
- **Klee One** font (Google Fonts, 教科書体-style) — subset for hiragana/katakana
- **Cloudflare R2** — cache generated PDFs, free tier (10GB, 10M reads/month)
- **Cloudflare Worker** — GET/PUT proxy for R2
- Generate client-side on first request, upload to R2, serve cached on repeat
- Version prefix (`v1/学.pdf`) for template invalidation

### Pending: Other Features (Issues #5-#8)
- #5: Connect kokugo.app domain
- #6: ゆるキャラ mascot (dusty mint dragon, 200x200 PNG assets)
- #7: 読み書きの練習シート (reading/writing practice sheet)
- #8: Kanji games (Memory Match, Kanji Rain, Stroke Order Challenge, etc.)

### ゆるキャラ Character Design Spec
- Dusty mint green blob-like dragon/kaiju body
- Dot eyes, wide simple mouth with tiny triangular teeth
- Pale butter yellow spikes, blush pink mouth
- Thin slightly imperfect black outlines
- Completely flat illustration, no shading/gradients
- "Soft monster" kawaii minimalist aesthetic
- Sanrio-adjacent but more offbeat / indie stationery feel
