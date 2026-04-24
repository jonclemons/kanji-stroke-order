# Kokugo Data Pipeline

The product should be able to run even if every upstream source is unavailable.
For that reason, source collection, scraping, graph enrichment, and runtime app
usage are separate layers.

## Layers

### Source Mirror Layer

Command: `bun run mirror:sources`

This is the only networked part of the new 国語 graph pipeline. It mirrors or
records metadata for public source material into `data/raw/kokugo-sources`.

Current source classes:

- MEXT official curriculum metadata: 文部科学省 documents are the authority root.
- 学習指導要領LOD snapshots and grade pages: machine-readable curriculum graph.
- 教科書LOD snapshots: future publisher/unit overlay source.

This command can be run manually, by a scheduled job, or from a separate machine.
It should not run during app deploys or during user sessions.

### Graph Build Layer

Command: `bun run graph:build`

This step reads only local mirrors plus existing local app data and writes:

- `build/kokugo-graph.sqlite`
- `public/data/v2/graph/...`
- `reports/kokugo-graph-coverage.md`

`graph:build` intentionally patches `fetch` to throw unless
`KOKUGO_GRAPH_ALLOW_NETWORK=1` is set. The default build is offline so a blocked
upstream site cannot break production.

### Validation Layer

Command: `bun run graph:check`

This verifies provenance, official 1026-kanji coverage, the local 1006-kanji
migration gap, wider 国語 domain exports, and example rendering behavior.

### Product Layer

The app should consume only static JSON:

- `public/data/v2/graph/manifest.json`
- `public/data/v2/graph/search-index.json`
- `public/data/v2/graph/kanji/{hex}.json`
- `public/data/v2/graph/vocab/{id}.json`
- `public/data/v2/graph/examples/{id}.json`
- `public/data/v2/graph/progressions/{id}.json`

Runtime code should not fetch MEXT, JP-COS, 教科書LOD, publisher pages, KanjiAPI,
or KanjiVG directly once the cutover is ready.

## R2 Hosting Shape

R2 is the primary artifact host for the graph pipeline, but it is not part of
the live app deploy yet. Graph refreshes publish objects only; they do not run
`wrangler deploy`.

Artifact tiers:

- Public graph bucket: `kokugo-graph-public`
  - Serves public/static graph JSON.
  - Intended custom domain: `https://data.kokugo.app`.
  - Immutable builds: `/v2/builds/{buildId}/graph/...`.
  - Channel pointers: `/v2/channels/staging/manifest.json` and
    `/v2/channels/prod/manifest.json`.
- Private source mirror bucket: `kokugo-source-mirrors`
  - Stores raw JP-COS, MEXT metadata, 教科書LOD snapshots, source manifests, and
    fetch status.
  - Not served by the app.
- Private build artifact bucket: `kokugo-graph-builds`
  - Stores SQLite DBs, coverage reports, validation logs, and audit bundles.
  - Retained for debugging and provenance only.

Cache policy:

- Immutable build files use `Cache-Control: public, max-age=31536000, immutable`.
- Channel manifests use `Cache-Control: public, max-age=60, must-revalidate`.
- Raw mirrors and build audit bundles use private/no-store cache metadata.

Future app cutover should introduce a graph base URL setting, default it to the
local bundled `/data/v2/graph`, and switch production to
`https://data.kokugo.app/v2/channels/prod` only after parity checks pass.

## GitHub Actions

The graph pipeline has three workflows, all separate from the existing live
Worker deploy workflow.

- `mirror-sources.yml`
  - Manual and monthly scheduled trigger.
  - Runs `bun run mirror:sources`.
  - Uploads a tarball of `data/raw/kokugo-sources` to the private source mirror
    bucket under both an immutable build key and `latest.tar.gz`.
  - Uses explicit user-agent/contact metadata.
- `build-graph.yml`
  - Manual and after a successful mirror workflow.
  - Downloads the latest approved source mirror bundle from private R2.
  - Runs `bun run graph:build` and `bun run graph:check`.
  - Uploads the immutable graph tree to `kokugo-graph-public`.
  - Updates only the staging channel manifest.
  - Uploads SQLite/report audit bundles to `kokugo-graph-builds`.
- `promote-graph.yml`
  - Manual only.
  - Updates the prod channel manifest to point at a validated immutable build.
  - Uses the `production-data` environment so GitHub environment approval rules
    can gate promotion.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Optional repository variables:

- `GRAPH_BUCKET` defaults to `kokugo-graph-public`.
- `SOURCE_MIRROR_BUCKET` defaults to `kokugo-source-mirrors`.
- `BUILD_ARTIFACT_BUCKET` defaults to `kokugo-graph-builds`.
- `GRAPH_BASE_URL` defaults to `https://data.kokugo.app`.
- `KOKUGO_SOURCE_CONTACT` defaults to `https://kokugo.app`.

Local dry-run helpers:

```sh
node scripts/data-pipeline/r2-upload-tree.mjs \
  --dry-run \
  --bucket kokugo-graph-public \
  --root public/data/v2/graph \
  --prefix v2/builds/test/graph \
  --cache-control "public, max-age=31536000, immutable"

node scripts/data-pipeline/r2-write-channel-manifest.mjs \
  --dry-run \
  --bucket kokugo-graph-public \
  --channel staging \
  --build-id test \
  --base-url https://data.kokugo.app
```

Public smoke check, after `data.kokugo.app` and the channel manifest exist:

```sh
node scripts/data-pipeline/check-r2-graph.mjs \
  --base-url https://data.kokugo.app \
  --channel staging
```

## Blocking And Fallback Policy

The source mirror script stops immediately on repeated blocking signals for a
source. For `403` or `429`, it writes `data/raw/kokugo-sources/source-status.json`
with `blocked` or `rate-limited`, preserves last-good snapshots, and exits
non-zero so CI surfaces the event.

No automatic IP rotation is implemented. An alternate runner is allowed only
after cooldown/manual review, must use the same user-agent/contact metadata, and
must lower request rate. This is continuity and network recovery, not stealth
evasion.

## Provider Neutrality

Cloudflare Pages/R2 is a good deployment path, but the data pipeline should not
depend on Cloudflare.

The portable artifact is the static graph export. It can be served from:

- the Git repository / bundled public assets
- Cloudflare Pages or R2
- S3 or compatible object storage
- Backblaze B2
- GitHub Releases
- a VPS/static file server
- a school, library, or community mirror

The runtime contract is just "serve immutable JSON files with normal HTTP
caching." This keeps the free public product resilient and portable.

## Cutover Plan

1. Keep current UI/API behavior unchanged while graph exports mature.
2. Add a graph data client that reads `public/data/v2/graph/manifest.json`.
3. Replace direct frontend KanjiAPI/KanjiVG calls with graph JSON reads.
4. Keep the current v1 mirror as a fallback until all 1026 official kanji have
   info/SVG coverage or explicit placeholders.
5. Add publisher progression overlays only after source-backed extraction exists.
6. Add reviewed child-facing vocab/example/sentence nodes after curation rules.
7. Add active recall and spaced repetition on top of graph nodes, not source APIs.

## Operating Principle

MEXT is the root. Everything else is an attributed graph claim or overlay:

- official curriculum eligibility: MEXT / 学習指導要領LOD
- publisher path: optional, source-backed progression overlay
- vocabulary/examples: candidate or reviewed child-facing content
- AI generation: offline, reviewed, committed as static data
