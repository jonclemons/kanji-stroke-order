# Local Mirror Latency Report

## Goal

Reduce kanji lookup latency by mirroring the elementary-school dataset to our own same-origin static files instead of depending on live third-party API calls during the app flow.

## Method

- Sample kanji: `交`
- Sample grade list: `2年生`
- Measurement script: `scripts/measure-latency.mjs`
- Runs per endpoint: `5`
- Measured on: `2026-04-20`
- Current deployed commit: `0d0fef3`
- Endpoints measured:
  - kanji info
  - kanji words
  - stroke SVG
  - grade 2 list

## Upstream Baseline

Measured against the live third-party endpoints with `MEASURE_RUNS=5 MEASURE_MODE=upstream bun run measure:latency`.

| Endpoint | Avg | Min | Max | Notes |
| --- | ---: | ---: | ---: | --- |
| `kanji_info` | `143.0 ms` | `65.8 ms` | `437.7 ms` | Small JSON payload from `kanjiapi.dev` |
| `kanji_words` | `613.6 ms` | `85.2 ms` | `1322.4 ms` | Largest and most variable request |
| `kanjivg_svg` | `88.1 ms` | `46.1 ms` | `249.3 ms` | SVG from `raw.githubusercontent.com` |
| `grade_2_list` | `116.9 ms` | `58.6 ms` | `327.6 ms` | Grade list from `kanjiapi.dev` |

## Live Pages Mirror

Measured against the deployed Cloudflare Pages mirror with `MEASURE_RUNS=5 MEASURE_MODE=local MEASURE_LOCAL_BASE=https://kanji-stroke-order.pages.dev bun run measure:latency`.

| Endpoint | Avg | Min | Max | Vs upstream avg |
| --- | ---: | ---: | ---: | ---: |
| `kanji_info` | `135.4 ms` | `62.7 ms` | `404.6 ms` | about `1.1x` faster |
| `kanji_words` | `175.9 ms` | `100.7 ms` | `404.4 ms` | about `3.5x` faster |
| `kanjivg_svg` | `130.4 ms` | `63.8 ms` | `349.2 ms` | about `1.5x` slower |
| `grade_2_list` | `126.3 ms` | `61.7 ms` | `348.2 ms` | about `1.1x` slower |

## Notes

- The words endpoint is the biggest latency problem.
- Variability is still a problem upstream: `kanji_words` ranged from `85.2 ms` to `1322.4 ms` across just five runs.
- The live Cloudflare Pages mirror now serves the mirrored files from same-origin paths like `/data/v1/info/04ea4.json` and `/data/v1/words/04ea4.json`.
- In this curl-based test, each sample opens a fresh HTTPS request, so it does not benefit from browser connection reuse, HTTP/2 multiplexing, IndexedDB, or warm in-app caches.
- That means the live Pages numbers above are a conservative measurement of production performance; real in-browser app flows should benefit more than these raw curl numbers suggest, especially after the first request.
- The mirror build completed successfully for all `1006` elementary-school kanji.
- The local mirror currently produced `3030` mirrored files under `public/data/v1`.
- The app now prefers same-origin mirrored files and only falls back upstream if a mirrored file is missing.
