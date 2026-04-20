# Local Mirror Latency Report

## Goal

Reduce kanji lookup latency by mirroring the elementary-school dataset to our own same-origin static files instead of depending on live third-party API calls during the app flow.

## Method

- Sample kanji: `交`
- Sample grade list: `2年生`
- Measurement script: `scripts/measure-latency.mjs`
- Runs per endpoint: `3`
- Endpoints measured:
  - kanji info
  - kanji words
  - stroke SVG
  - grade 2 list

## Before

Measured against the live third-party endpoints with `MEASURE_MODE=upstream bun run measure:latency`.

| Endpoint | Avg | Min | Max | Notes |
| --- | ---: | ---: | ---: | --- |
| `kanji_info` | `368.3 ms` | `83.2 ms` | `646.5 ms` | Small JSON payload from `kanjiapi.dev` |
| `kanji_words` | `567.4 ms` | `99.9 ms` | `1230.4 ms` | Largest and most variable request |
| `kanjivg_svg` | `125.5 ms` | `45.9 ms` | `274.4 ms` | SVG from `raw.githubusercontent.com` |
| `grade_2_list` | `357.1 ms` | `319.5 ms` | `429.3 ms` | Grade list from `kanjiapi.dev` |

## After

Measured against the local mirrored same-origin files with `MEASURE_MODE=local bun run measure:latency`.

| Endpoint | Avg | Min | Max | Improvement vs before avg |
| --- | ---: | ---: | ---: | ---: |
| `kanji_info` | `2.5 ms` | `1.1 ms` | `4.2 ms` | about `147.3x` faster |
| `kanji_words` | `1.9 ms` | `1.5 ms` | `2.2 ms` | about `298.6x` faster |
| `kanjivg_svg` | `2.0 ms` | `1.4 ms` | `2.8 ms` | about `62.8x` faster |
| `grade_2_list` | `1.4 ms` | `1.0 ms` | `2.0 ms` | about `255.1x` faster |

## Browser Check

- Checked the live production app in a real Chromium session with Playwright against `https://kanji-stroke-order.pages.dev/#grade/2/%E4%BA%A4`.
- The current production app did not restore the `交` detail view directly from that hash URL and instead landed on `#grade/2`, so the browser check used: open page -> reload -> click `交`.
- Browser network inspection confirmed the production app is still making live requests to:
  - `https://kanjiapi.dev/v1/kanji/grade-2`
  - `https://kanjiapi.dev/v1/kanji/%E4%BA%A4`
  - `https://kanjiapi.dev/v1/words/%E4%BA%A4`
  - `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/04ea4.svg`

## Notes

- The words endpoint is the biggest latency problem.
- Variability is also a problem: the same upstream endpoint ranged from `83.2 ms` to `646.5 ms` for `kanji_info`, and from `99.9 ms` to `1230.4 ms` for `kanji_words`, across just three runs.
- Local CPU work in the app was previously measured as negligible compared with network fetch time.
- The mirror build completed successfully for all `1006` elementary-school kanji.
- The local mirror currently produced `3030` mirrored files under `public/data/v1`.
- The app now prefers same-origin mirrored files and only falls back upstream if a mirrored file is missing.
