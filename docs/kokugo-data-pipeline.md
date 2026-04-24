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

