import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const GRAPH_ROOT = path.join(ROOT, "public", "data", "v2", "graph");
const REPORT_PATH = path.join(ROOT, "reports", "kokugo-graph-coverage.md");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function listJsonFiles(dirPath) {
  if (!(await exists(dirPath))) {
    return [];
  }
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(dirPath, entry.name));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertProvenance(node, label) {
  assert(node.provenance, `${label} missing provenance`);
  assert(Array.isArray(node.provenance.claims), `${label} provenance missing claims`);
  assert(node.provenance.claims.length > 0, `${label} provenance has no claims`);
  for (const claim of node.provenance.claims) {
    assert(claim.sourceId, `${label} claim missing sourceId`);
    assert(claim.predicate, `${label} claim missing predicate`);
    assert(typeof claim.confidence === "number", `${label} claim missing confidence`);
  }
}

async function main() {
  const manifest = await readJson(path.join(GRAPH_ROOT, "manifest.json"));
  const searchIndex = await readJson(path.join(GRAPH_ROOT, "search-index.json"));
  const domains = await readJson(path.join(GRAPH_ROOT, "domains.json"));
  const gradeOnly = await readJson(path.join(GRAPH_ROOT, "progressions", "grade-only.json"));

  assert(manifest.id === "kokugo-graph-v2", "manifest id mismatch");
  assert(manifest.pipeline?.mode === "offline-build-from-mirrors", "offline pipeline metadata missing");
  assert(
    manifest.pipeline?.productContract?.includes("static JSON"),
    "static product contract missing from graph manifest",
  );
  assert(
    manifest.pipeline?.artifactDistribution?.some((target) => target.includes("S3")),
    "provider-neutral artifact distribution missing",
  );
  assert(manifest.curriculumRoot?.authority === "文部科学省", "MEXT curriculum root missing");
  assert(
    manifest.sources?.some((source) => source.id === "mext-elementary-course-of-study-2017-pdf"),
    "official MEXT curriculum PDF source missing",
  );
  assert(manifest.coverage?.officialExpectedTotal === 1026, "expected official 1026 baseline missing");
  assert(manifest.coverage?.currentLocalTotal === 1006, "current local 1006 migration baseline missing");
  assert(Array.isArray(manifest.coverage?.gradeMismatches), "grade mismatch report missing");
  assert(Array.isArray(searchIndex.entries) && searchIndex.entries.length > 0, "search index is empty");
  assert(Array.isArray(domains) && domains.length >= 7, "wider 国語 domains missing");
  assert(domains.some((domain) => domain.id === "grammar"), "grammar domain missing");
  assert(domains.some((domain) => domain.id === "reading-practice"), "reading-practice domain missing");
  assert(domains.some((domain) => domain.id === "classical-japanese"), "classical-japanese domain missing");
  assert(domains.some((domain) => domain.id === "sayings"), "sayings domain missing");
  assert(domains.some((domain) => domain.id === "yojijukugo"), "yojijukugo domain missing");

  assert(gradeOnly.id === "grade-only", "grade-only progression missing");
  assert(gradeOnly.basis === "official-curriculum-grade", "grade-only basis must be official curriculum");
  assert(gradeOnly.items.length === 1026, "grade-only progression must include 1026 official kanji");
  assertProvenance(gradeOnly, "progressions/grade-only");
  for (const item of gradeOnly.items) {
    assertProvenance(item, `progressions/grade-only:${item.kanji}`);
    assert(Number.isInteger(item.grade), `progression item missing grade: ${item.kanji}`);
    assert(Number.isInteger(item.sequence), `progression item missing sequence: ${item.kanji}`);
  }

  for (const domain of domains) {
    assertProvenance(domain, `domain:${domain.id}`);
  }

  const kanjiFiles = await listJsonFiles(path.join(GRAPH_ROOT, "kanji"));
  const vocabFiles = await listJsonFiles(path.join(GRAPH_ROOT, "vocab"));
  const exampleFiles = await listJsonFiles(path.join(GRAPH_ROOT, "examples"));

  assert(kanjiFiles.length === manifest.counts.graphKanji, "kanji export count mismatch");
  assert(vocabFiles.length === manifest.counts.vocabulary, "vocab export count mismatch");
  assert(exampleFiles.length === manifest.counts.examples, "example export count mismatch");

  for (const filePath of kanjiFiles) {
    const node = await readJson(filePath);
    assertProvenance(node, `kanji/${path.basename(filePath)}`);
    for (const reading of node.readings || []) {
      assertProvenance(reading, `reading:${reading.id}`);
    }
  }

  for (const filePath of vocabFiles) {
    const node = await readJson(filePath);
    assertProvenance(node, `vocab/${path.basename(filePath)}`);
    assert(Array.isArray(node.domains) && node.domains.includes("vocabulary"), `${node.id} missing vocabulary domain`);
    assert(node.reviewStatus === "candidate-unreviewed", `${node.id} missing candidate review status`);
  }

  for (const filePath of exampleFiles) {
    const node = await readJson(filePath);
    assertProvenance(node, `example/${path.basename(filePath)}`);
    assert(
      node.renderings?.some((rendering) => rendering.text === "五がつにそつぎょうした"),
      `${node.id} missing known-五 rendering demo`,
    );
  }

  for (const requiredScope of [
    ["grammar", "grammar-scope.json"],
    ["readings", "reading-practice-scope.json"],
    ["classical", "classical-japanese-scope.json"],
    ["sayings", "sayings-scope.json"],
    ["yojijukugo", "yojijukugo-scope.json"],
  ]) {
    const [dir, file] = requiredScope;
    const scope = await readJson(path.join(GRAPH_ROOT, dir, file));
    assertProvenance(scope, `${dir}/${file}`);
    assert(Array.isArray(scope.nodes) && scope.nodes.length > 0, `${dir}/${file} has no scope nodes`);
  }

  const report = await fs.readFile(REPORT_PATH, "utf8");
  assert(report.includes("Current local v1 kanji mirror: 1006"), "report missing local 1006 gap");
  assert(report.includes("Official JP-COS elementary kanji: 1026/1026"), "report missing official 1026 baseline");
  assert(report.includes("Pipeline Boundary"), "report missing pipeline boundary");

  console.log(
    `kokugo graph check passed: ${kanjiFiles.length} kanji, ${vocabFiles.length} vocab, ${exampleFiles.length} examples`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
