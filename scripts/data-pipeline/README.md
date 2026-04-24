# Data Pipeline Scripts

These scripts are build-time tools for the 国語 graph. They are intentionally
separate from runtime app code.

- `mirror-kokugo-sources.mjs`: networked source mirror/metadata capture.
- `build-kokugo-graph.mjs`: offline SQLite build and static JSON export.
- `check-kokugo-graph.mjs`: offline validation of exported graph artifacts.

Normal app builds should not call `mirror-kokugo-sources.mjs`. Production should
consume committed or mirrored static data from `public/data/v2/graph`.

