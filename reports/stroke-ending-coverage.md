# Stroke Ending Coverage via `kvg:type`

Measured on `2026-04-21` against the mirrored elementary-school KanjiVG dataset in `public/data/v1/svg`.

## Summary

Practical coverage score for stroke-ending guidance via `kvg:type`: **97.5 / 100**

That score reflects the share of strokes that can be mapped cleanly and unambiguously to one ending category:

- `とめ`
- `はね`
- `はらい`

## Dataset Size

- Kanji files: `1006`
- Total strokes: `9467`

## Coverage

| Metric | Result |
| --- | ---: |
| Raw `kvg:type` presence on strokes | `100%` |
| Normalized ending coverage | `100%` |
| Unambiguous ending coverage | `97.52%` |
| Ambiguous strokes needing review / override | `2.48%` |
| Kanji with all strokes unambiguous | `79.52%` |
| Kanji with at least one ambiguous stroke | `20.48%` |

## Coverage By School Grade

| Grade | Kanji | Strokes | Unambiguous strokes | Ambiguous strokes | Kanji with all strokes unambiguous |
| --- | ---: | ---: | ---: | ---: | ---: |
| `1年生` | `80` | `400` | `98.25%` | `1.75%` | `91.25%` |
| `2年生` | `160` | `1318` | `97.57%` | `2.43%` | `82.50%` |
| `3年生` | `200` | `1881` | `97.66%` | `2.34%` | `79.50%` |
| `4年生` | `200` | `1971` | `97.31%` | `2.69%` | `78.00%` |
| `5年生` | `185` | `1982` | `97.38%` | `2.62%` | `75.68%` |
| `6年生` | `181` | `1915` | `97.55%` | `2.45%` | `77.35%` |

## Notes

- A strict exact-match score is only `67.04%`, but that is misleadingly low because KanjiVG uses many suffixed forms like `㇐a`, `㇑a`, `㇕b`.
- After normalizing suffixes, every stroke still maps to at least one ending bucket.
- The remaining ambiguity comes mostly from slash variants that cross ending categories, such as:
  - `㇔/㇏`
  - `㇀/㇐`
  - `㇒/㇚`
- In practice, this means:
  - `9232 / 9467` strokes can be labeled automatically with high confidence
  - `235 / 9467` strokes should be reviewed with a small override table

## Distribution After Normalization

| Ending | Count | Share |
| --- | ---: | ---: |
| `とめ` | `6307` | `66.62%` |
| `はね` | `1029` | `10.87%` |
| `はらい` | `1896` | `20.03%` |
| Ambiguous | `235` | `2.48%` |

## Recommendation

`kvg:type` is strong enough to use as the base signal for stroke-ending guidance now.

Recommended product stance:

- Use automatic labels for the `97.52%` unambiguous strokes
- Keep a small manual override table for the `2.48%` ambiguous cases
- Prefer kid-facing labels in Japanese: `とめ`, `はね`, `はらい`
