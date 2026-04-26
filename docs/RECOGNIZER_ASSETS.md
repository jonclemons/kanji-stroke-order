# Recognizer Assets

The hidden `/lab/draw` prototype runs recognition locally in the browser. The TFLite runtime is served as generated static assets, while the DaKanji model and labels live in the `RECOGNIZER_ASSETS` R2 bucket.

## Local WASM Runtime

```sh
bun run sync:recognizer
```

This copies `@tensorflow/tfjs-tflite/wasm` plus the local TensorFlow browser runtime files into `public/recognizer-wasm/`. That folder is generated, ignored by git, and lazy-loaded only from `/lab/draw` when recognition starts.

## R2 Model Upload

```sh
bun run sync:recognizer:r2
```

The script downloads DaKanji `v1.2.zip`, extracts `model.tflite` and `labels.txt`, patches the TFLite browser copy to a fixed `1x64x64x1` input shape, then uploads:

- `dakanji/v1.2-browser64/model.tflite`
- `dakanji/v1.2-browser64/labels.txt`

The 23 MB model file must not be committed.

For staging, use the separate recognizer bucket:

```sh
bun run sync:recognizer:r2:staging
```

The staging Worker environment is configured in `wrangler.jsonc` to use:

- `kanji-recognizer-assets-staging` for `RECOGNIZER_ASSETS`
- `kanji-sheets-staging` for `SHEETS`

Create those buckets once before the first staging deploy if they do not already exist:

```sh
bunx wrangler r2 bucket create kanji-recognizer-assets-staging
bunx wrangler r2 bucket create kanji-sheets-staging
```

The Worker exposes only:

- `/api/recognizer-assets/model.tflite`
- `/api/recognizer-assets/labels.txt`

Both routes use long immutable cache headers when the R2 objects exist.
