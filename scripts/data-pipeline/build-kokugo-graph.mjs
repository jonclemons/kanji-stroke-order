import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Database } from "bun:sqlite";

const ROOT = process.cwd();
const RAW_ROOT = path.join(ROOT, "data", "raw", "kokugo-sources");
const V1_ROOT = path.join(ROOT, "public", "data", "v1");
const OUTPUT_ROOT = path.join(ROOT, "public", "data", "v2", "graph");
const BUILD_ROOT = path.join(ROOT, "build");
const DB_PATH = path.join(BUILD_ROOT, "kokugo-graph.sqlite");
const REPORT_PATH = path.join(ROOT, "reports", "kokugo-graph-coverage.md");
const GENERATED_AT = new Date().toISOString();
const OFFICIAL_TOTAL = 1026;

if (process.env.KOKUGO_GRAPH_ALLOW_NETWORK !== "1") {
  globalThis.fetch = () => {
    throw new Error(
      "graph:build is intentionally offline. Run `bun run mirror:sources` to update raw source snapshots.",
    );
  };
}

const DOMAIN_SEEDS = [
  {
    id: "kanji",
    label: "漢字",
    kind: "reference-domain",
    status: "populated",
    description: "教育漢字, 字形, 画数, よみ, かきじゅん, 学年配当.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-grade-kanji-2017",
      "kanjiapi-v1-local-info",
      "kanjivg-local-svg",
    ],
  },
  {
    id: "vocabulary",
    label: "語彙",
    kind: "reference-domain",
    status: "partially-populated",
    description: "漢字に結びついた語彙候補. 学年・既習漢字に応じた表記へ展開する.",
    sourceIds: ["kanjiapi-v1-local-words"],
  },
  {
    id: "grammar",
    label: "文法",
    kind: "reference-domain",
    status: "schema-ready",
    description: "助詞, 文の組み立て, 活用, 敬語などを学習指導要領と教材単元に結ぶ.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
  {
    id: "reading-practice",
    label: "読むこと・読解",
    kind: "reference-domain",
    status: "schema-ready",
    description: "説明文, 物語文, 詩, 音読, 読解問題テンプレートを扱う.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
  {
    id: "classical-japanese",
    label: "古典",
    kind: "reference-domain",
    status: "schema-ready",
    description: "古文, 漢文, 音読, 伝統的な言語文化への橋渡し.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
  {
    id: "sayings",
    label: "ことわざ・慣用句",
    kind: "reference-domain",
    status: "schema-ready",
    description: "ことわざ, 慣用句, 故事成語を語彙・読解・表現に結ぶ.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
  {
    id: "yojijukugo",
    label: "四字熟語",
    kind: "reference-domain",
    status: "schema-ready",
    description: "四字熟語を漢字, 読み, 意味, 例文, 既習条件に結ぶ.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
  {
    id: "writing-expression",
    label: "書くこと・表現",
    kind: "reference-domain",
    status: "schema-ready",
    description: "作文, 日記, 要約, 推敲, 表現技法を扱う.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
  {
    id: "speaking-listening",
    label: "話すこと・聞くこと",
    kind: "reference-domain",
    status: "schema-ready",
    description: "発表, 対話, 聞き取り, 話し合いを扱う.",
    sourceIds: [
      "mext-elementary-course-of-study-2017-pdf",
      "mext-elementary-kokugo-commentary-2022-pdf",
      "jp-cos-all-20250927",
      "jp-textbook-all-teaching-unit-20260407",
    ],
  },
];

const SCOPE_EXPORTS = [
  {
    directory: "grammar",
    id: "grammar-scope",
    label: "文法スコープ",
    domainId: "grammar",
    nodes: [
      ["particles", "助詞"],
      ["sentence-structure", "文の組み立て"],
      ["predicate-forms", "述語・活用"],
      ["modifiers", "修飾語"],
      ["honorifics", "敬語"],
    ],
  },
  {
    directory: "readings",
    id: "reading-practice-scope",
    label: "読むこと・読解スコープ",
    domainId: "reading-practice",
    nodes: [
      ["story", "物語文"],
      ["expository", "説明文"],
      ["poetry", "詩"],
      ["oral-reading", "音読"],
      ["comprehension", "読解問題"],
    ],
  },
  {
    directory: "classical",
    id: "classical-japanese-scope",
    label: "古典スコープ",
    domainId: "classical-japanese",
    nodes: [
      ["kobun", "古文"],
      ["kanbun", "漢文"],
      ["traditional-language-culture", "伝統的な言語文化"],
    ],
  },
  {
    directory: "sayings",
    id: "sayings-scope",
    label: "ことわざ・慣用句スコープ",
    domainId: "sayings",
    nodes: [
      ["kotowaza", "ことわざ"],
      ["kanyoku", "慣用句"],
      ["kojiseigo", "故事成語"],
    ],
  },
  {
    directory: "yojijukugo",
    id: "yojijukugo-scope",
    label: "四字熟語スコープ",
    domainId: "yojijukugo",
    nodes: [
      ["meaning", "意味"],
      ["reading", "読み"],
      ["example", "例文"],
      ["kanji-coverage", "既習漢字"],
    ],
  },
];

const SEEDED_EXAMPLES = [
  {
    id: "example-gogatsu-sotsugyou",
    kind: "sentence",
    domains: ["kanji", "vocabulary", "reading-practice"],
    canonicalText: "五月に卒業した",
    readingText: "ごがつにそつぎょうした",
    tokens: [
      { text: "五", reading: "ご", kanji: ["五"] },
      { text: "月", reading: "がつ", kanji: ["月"] },
      { text: "に", reading: "に", kanji: [] },
      { text: "卒業", reading: "そつぎょう", kanji: ["卒", "業"] },
      { text: "した", reading: "した", kanji: [] },
    ],
    sourceId: "kokugo-graph-seed",
    sourceUri: "local://kokugo-graph/seed/example-gogatsu-sotsugyou",
  },
];

function kanjiToHex(char) {
  return char.codePointAt(0).toString(16).padStart(5, "0");
}

function stableId(prefix, value) {
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 16);
  return `${prefix}-${hash}`;
}

function isHan(char) {
  return /\p{Script=Han}/u.test(char);
}

function extractKanji(text) {
  return Array.from(new Set(Array.from(text || "").filter(isHan)));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function claim(predicate, value, sourceId, sourceUri, confidence = 1) {
  return {
    predicate,
    value,
    sourceId,
    sourceUri,
    confidence,
    capturedAt: GENERATED_AT,
  };
}

function provenance(claims) {
  return {
    claims,
    sourceIds: Array.from(new Set(claims.map((item) => item.sourceId))),
  };
}

function createDb() {
  return new Database(DB_PATH);
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE sources (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      canonical_url TEXT,
      snapshot_path TEXT,
      license TEXT,
      attribution TEXT,
      snapshot_sha256 TEXT,
      snapshot_bytes INTEGER,
      generated_at TEXT NOT NULL
    );
    CREATE TABLE domains (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT NOT NULL,
      provenance_json TEXT NOT NULL
    );
    CREATE TABLE kanji (
      id TEXT PRIMARY KEY,
      kanji TEXT NOT NULL UNIQUE,
      hex TEXT NOT NULL UNIQUE,
      official_grade INTEGER,
      local_grade INTEGER,
      stroke_count INTEGER,
      status TEXT NOT NULL,
      provenance_json TEXT NOT NULL
    );
    CREATE TABLE readings (
      id TEXT PRIMARY KEY,
      kanji TEXT NOT NULL,
      reading_type TEXT NOT NULL,
      reading TEXT NOT NULL,
      provenance_json TEXT NOT NULL
    );
    CREATE TABLE vocabulary (
      id TEXT PRIMARY KEY,
      written TEXT NOT NULL,
      reading TEXT NOT NULL,
      official_max_grade INTEGER,
      local_max_grade INTEGER,
      domains_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL
    );
    CREATE TABLE examples (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      canonical_text TEXT NOT NULL,
      reading_text TEXT NOT NULL,
      domains_json TEXT NOT NULL,
      renderings_json TEXT NOT NULL,
      provenance_json TEXT NOT NULL
    );
    CREATE TABLE progression_profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      basis TEXT NOT NULL,
      publisher TEXT,
      source_uri TEXT,
      confidence REAL NOT NULL,
      provenance_json TEXT NOT NULL
    );
    CREATE TABLE progression_items (
      profile_id TEXT NOT NULL,
      kanji TEXT NOT NULL,
      grade INTEGER NOT NULL,
      sequence INTEGER,
      source_uri TEXT,
      confidence REAL NOT NULL,
      provenance_json TEXT NOT NULL,
      PRIMARY KEY (profile_id, kanji)
    );
    CREATE TABLE claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      predicate TEXT NOT NULL,
      object_value TEXT,
      source_id TEXT NOT NULL,
      source_uri TEXT,
      confidence REAL NOT NULL
    );
  `);
}

function insertClaim(db, subjectType, subjectId, item) {
  db.run(
    `INSERT INTO claims (subject_type, subject_id, predicate, object_value, source_id, source_uri, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      subjectType,
      subjectId,
      item.predicate,
      item.value == null ? null : JSON.stringify(item.value),
      item.sourceId,
      item.sourceUri || null,
      item.confidence,
    ],
  );
}

function insertSource(db, source) {
  db.run(
    `INSERT OR REPLACE INTO sources
       (id, label, kind, canonical_url, snapshot_path, license, attribution, snapshot_sha256, snapshot_bytes, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      source.id,
      source.label,
      source.kind,
      source.canonicalUri || source.canonical_url || source.url || null,
      source.path || null,
      source.license || null,
      source.attribution || null,
      source.sha256 || null,
      source.bytes || null,
      source.mirroredAt || source.generatedAt || GENERATED_AT,
    ],
  );
}

function renderTokens(tokens, knownKanji) {
  return tokens
    .map((token) => {
      if (!token.kanji?.length) {
        return token.text;
      }
      return token.kanji.every((kanji) => knownKanji.has(kanji)) ? token.text : token.reading;
    })
    .join("");
}

function maxGradeForKanji(chars, gradeMap) {
  const grades = chars.map((char) => gradeMap.get(char)).filter((grade) => Number.isInteger(grade));
  if (grades.length !== chars.length) {
    return null;
  }
  return Math.max(...grades);
}

function readingObjects(kanji, info, sourceUri) {
  const readings = [];
  for (const reading of info?.kun_readings || []) {
    readings.push({
      id: stableId("reading", `${kanji}|kun|${reading}`),
      type: "kun",
      reading,
      provenance: provenance([claim("kunReading", reading, "kanjiapi-v1-local-info", sourceUri, 0.8)]),
    });
  }
  for (const reading of info?.on_readings || []) {
    readings.push({
      id: stableId("reading", `${kanji}|on|${reading}`),
      type: "on",
      reading,
      provenance: provenance([claim("onReading", reading, "kanjiapi-v1-local-info", sourceUri, 0.8)]),
    });
  }
  return readings;
}

async function loadOfficialGrades() {
  const filePath = path.join(RAW_ROOT, "derived", "mext-grade-kanji-2017.json");
  if (!(await exists(filePath))) {
    throw new Error("Missing official grade mirror. Run `bun run mirror:sources` first.");
  }

  const data = await readJson(filePath);
  const items = [];
  for (const [gradeText, gradeItems] of Object.entries(data.grades)) {
    const grade = Number(gradeText);
    for (const item of gradeItems) {
      items.push({
        kanji: item.kanji,
        grade,
        sequence: item.sequence,
        sourceId: item.sourceId,
        sourceUri: item.sourceUri,
      });
    }
  }

  return { data, items };
}

async function loadLocalGrades() {
  const manifestPath = path.join(V1_ROOT, "manifest.json");
  if (!(await exists(manifestPath))) {
    throw new Error("Missing local v1 kanji mirror. Run `bun run mirror:data` first.");
  }

  const manifest = await readJson(manifestPath);
  const items = [];
  for (const [gradeText, kanjiList] of Object.entries(manifest.grades || {})) {
    const grade = Number(gradeText);
    for (const kanji of kanjiList) {
      items.push({ kanji, grade });
    }
  }
  return { manifest, items };
}

async function loadRawManifestSources() {
  const manifestPath = path.join(RAW_ROOT, "manifest.json");
  if (!(await exists(manifestPath))) {
    return [];
  }

  const manifest = await readJson(manifestPath);
  return manifest.sources || [];
}

async function loadInfo(hex) {
  const infoPath = path.join(V1_ROOT, "info", `${hex}.json`);
  if (!(await exists(infoPath))) {
    return null;
  }
  return readJson(infoPath);
}

async function loadWords(hex) {
  const wordsPath = path.join(V1_ROOT, "words", `${hex}.json`);
  if (!(await exists(wordsPath))) {
    return [];
  }
  return readJson(wordsPath);
}

function sourceDefinitions(rawSources) {
  return [
    ...rawSources,
    {
      id: "mext-grade-kanji-2017",
      label: "小学校学習指導要領 2017 学年別漢字配当表",
      kind: "derived-curriculum-data",
      canonicalUri: "https://w3id.org/jp-cos/8210000100000000",
      path: "data/raw/kokugo-sources/derived/mext-grade-kanji-2017.json",
      license: "CC BY 4.0",
      attribution: "学習指導要領LOD",
    },
    {
      id: "kanjiapi-v1-local-grade",
      label: "KanjiAPI local grade mirror",
      kind: "local-mirror",
      canonicalUri: "https://kanjiapi.dev",
      path: "public/data/v1/grades",
      license: "Upstream project license; local mirror for app data",
      attribution: "KanjiAPI",
    },
    {
      id: "kanjiapi-v1-local-info",
      label: "KanjiAPI local kanji info mirror",
      kind: "local-mirror",
      canonicalUri: "https://kanjiapi.dev",
      path: "public/data/v1/info",
      license: "Upstream project license; local mirror for app data",
      attribution: "KanjiAPI",
    },
    {
      id: "kanjiapi-v1-local-words",
      label: "KanjiAPI local word mirror",
      kind: "local-mirror",
      canonicalUri: "https://kanjiapi.dev",
      path: "public/data/v1/words",
      license: "Upstream project license; local mirror for app data",
      attribution: "KanjiAPI",
    },
    {
      id: "kanjivg-local-svg",
      label: "KanjiVG local SVG mirror",
      kind: "local-mirror",
      canonicalUri: "https://github.com/KanjiVG/kanjivg",
      path: "public/data/v1/svg",
      license: "KanjiVG upstream license",
      attribution: "KanjiVG",
    },
    {
      id: "kokugo-graph-seed",
      label: "Kokugo graph seed data",
      kind: "curated-seed",
      canonicalUri: "local://kokugo-graph/seed",
      path: "scripts/data-pipeline/build-kokugo-graph.mjs",
      license: "Project-authored seed data",
      attribution: "kokugo.app",
    },
  ];
}

function buildGradeOnlyProfile(officialItems) {
  const profileClaims = [
    claim(
      "officialCurriculumDocument",
      "小学校学習指導要領（平成29年告示）",
      "mext-elementary-course-of-study-2017-pdf",
      "https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2019/09/26/1413522_001.pdf",
      1,
    ),
    claim(
      "basis",
      "official-curriculum-grade",
      "mext-grade-kanji-2017",
      "https://w3id.org/jp-cos/8210000100000000",
      1,
    ),
  ];

  return {
    id: "grade-only",
    label: "学年だけで見る",
    basis: "official-curriculum-grade",
    publisher: null,
    grade: null,
    sequence: null,
    source_uri: "https://w3id.org/jp-cos/8210000100000000",
    confidence: 1,
    sequenceMeaning: "JP-COS allocation table position, not a publisher lesson order.",
    provenance: provenance(profileClaims),
    items: officialItems.map((item) => ({
      kanji: item.kanji,
      hex: kanjiToHex(item.kanji),
      grade: item.grade,
      sequence: item.sequence,
      source_uri: item.sourceUri,
      confidence: 1,
      provenance: provenance([
        claim("grade", item.grade, item.sourceId, item.sourceUri, 1),
        claim("sequence", item.sequence, item.sourceId, item.sourceUri, 1),
      ]),
    })),
  };
}

function buildScopeNode(scope) {
  const claims = [
    claim("domain", scope.domainId, "kokugo-graph-seed", `local://kokugo-graph/domains/${scope.domainId}`, 0.7),
  ];
  return {
    id: scope.id,
    type: "scope",
    label: scope.label,
    domainId: scope.domainId,
    status: "schema-ready",
    nodes: scope.nodes.map(([id, label]) => ({
      id,
      label,
      status: "planned",
      provenance: provenance([
        claim("scopeItem", label, "kokugo-graph-seed", `local://kokugo-graph/scopes/${scope.id}/${id}`, 0.7),
      ]),
    })),
    provenance: provenance(claims),
  };
}

function scoreVariant(variant, officialGradeMap) {
  const kanjiChars = extractKanji(variant.written);
  const maxOfficialGrade = maxGradeForKanji(kanjiChars, officialGradeMap);
  const priorityScore = (variant.priorities || []).length * 10;
  const gradeScore = maxOfficialGrade ? 8 - maxOfficialGrade : 0;
  const lengthScore = Math.max(0, 10 - Array.from(variant.written).length);
  return priorityScore + gradeScore + lengthScore;
}

async function buildVocabularyForKanji(kanji, officialGradeMap, localGradeMap) {
  const hex = kanjiToHex(kanji);
  const words = await loadWords(hex);
  const candidates = [];

  for (const entry of words) {
    for (const variant of entry.variants || []) {
      if (!variant?.written || !variant?.pronounced) {
        continue;
      }
      if (!variant.written.includes(kanji)) {
        continue;
      }
      if (Array.from(variant.written).length > 6) {
        continue;
      }
      const kanjiChars = extractKanji(variant.written);
      if (!kanjiChars.length || !kanjiChars.every((char) => officialGradeMap.has(char))) {
        continue;
      }

      candidates.push({
        written: variant.written,
        reading: variant.pronounced,
        meanings: (entry.meanings || []).flatMap((meaning) => meaning.glosses || []).slice(0, 3),
        priorities: variant.priorities || [],
        kanjiChars,
        officialMaxGrade: maxGradeForKanji(kanjiChars, officialGradeMap),
        localMaxGrade: maxGradeForKanji(kanjiChars, localGradeMap),
        score: scoreVariant(variant, officialGradeMap),
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.written.length - b.written.length || a.written.localeCompare(b.written, "ja"));
  return candidates.slice(0, 8);
}

function buildExampleRenderings(example, officialGradeMap) {
  const renderings = [];
  for (let grade = 1; grade <= 6; grade += 1) {
    const known = new Set(
      Array.from(officialGradeMap.entries())
        .filter(([, itemGrade]) => itemGrade <= grade)
        .map(([kanji]) => kanji),
    );
    renderings.push({
      id: `grade-only-${grade}`,
      profileId: "grade-only",
      grade,
      text: renderTokens(example.tokens, known),
      knownKanjiCount: known.size,
      source: "official grade eligibility",
    });
  }

  renderings.push({
    id: "known-five-only-demo",
    profileId: "custom-known-kanji",
    grade: 1,
    text: renderTokens(example.tokens, new Set(["五"])),
    knownKanji: ["五"],
    source: "manual progression demonstration",
  });

  return renderings;
}

async function main() {
  await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
  await ensureDir(OUTPUT_ROOT);
  await ensureDir(BUILD_ROOT);
  await ensureDir(path.dirname(REPORT_PATH));
  await fs.rm(DB_PATH, { force: true });
  await fs.rm(`${DB_PATH}-wal`, { force: true });
  await fs.rm(`${DB_PATH}-shm`, { force: true });

  const [{ data: officialData, items: officialItems }, { manifest: localManifest, items: localItems }, rawSources] =
    await Promise.all([loadOfficialGrades(), loadLocalGrades(), loadRawManifestSources()]);

  const officialByKanji = new Map(officialItems.map((item) => [item.kanji, item]));
  const officialGradeMap = new Map(officialItems.map((item) => [item.kanji, item.grade]));
  const localGradeMap = new Map(localItems.map((item) => [item.kanji, item.grade]));
  const allKanji = Array.from(new Set([...officialByKanji.keys(), ...localGradeMap.keys()])).sort((a, b) => {
    const gradeDelta = (officialGradeMap.get(a) || 99) - (officialGradeMap.get(b) || 99);
    if (gradeDelta) return gradeDelta;
    const seqDelta = (officialByKanji.get(a)?.sequence || 9999) - (officialByKanji.get(b)?.sequence || 9999);
    if (seqDelta) return seqDelta;
    return a.localeCompare(b, "ja");
  });

  const db = createDb();
  initializeSchema(db);

  for (const source of sourceDefinitions(rawSources)) {
    insertSource(db, source);
  }

  const domainExports = DOMAIN_SEEDS.map((domain) => {
    const claims = [
      claim("status", domain.status, "kokugo-graph-seed", `local://kokugo-graph/domains/${domain.id}`, 0.8),
      ...domain.sourceIds.map((sourceId) =>
        claim("plannedSource", sourceId, sourceId, `local://kokugo-graph/domains/${domain.id}/source/${sourceId}`, 0.7),
      ),
    ];
    const node = { ...domain, provenance: provenance(claims) };
    db.run(
      `INSERT INTO domains (id, label, kind, status, description, provenance_json) VALUES (?, ?, ?, ?, ?, ?)`,
      [node.id, node.label, node.kind, node.status, node.description, JSON.stringify(node.provenance)],
    );
    for (const item of node.provenance.claims) {
      insertClaim(db, "domain", node.id, item);
    }
    return node;
  });

  const profile = buildGradeOnlyProfile(officialItems);
  db.run(
    `INSERT INTO progression_profiles (id, label, basis, publisher, source_uri, confidence, provenance_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.id,
      profile.label,
      profile.basis,
      profile.publisher,
      profile.source_uri,
      profile.confidence,
      JSON.stringify(profile.provenance),
    ],
  );
  for (const item of profile.provenance.claims) {
    insertClaim(db, "progression_profile", profile.id, item);
  }
  for (const item of profile.items) {
    db.run(
      `INSERT INTO progression_items
        (profile_id, kanji, grade, sequence, source_uri, confidence, provenance_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [profile.id, item.kanji, item.grade, item.sequence, item.source_uri, item.confidence, JSON.stringify(item.provenance)],
    );
    for (const itemClaim of item.provenance.claims) {
      insertClaim(db, "progression_item", `${profile.id}:${item.kanji}`, itemClaim);
    }
  }

  await writeJson(path.join(OUTPUT_ROOT, "progressions", `${profile.id}.json`), profile);
  await writeJson(path.join(OUTPUT_ROOT, "domains.json"), domainExports);

  for (const scope of SCOPE_EXPORTS) {
    await writeJson(path.join(OUTPUT_ROOT, scope.directory, `${scope.id}.json`), buildScopeNode(scope));
  }

  const kanjiExports = [];
  const vocabById = new Map();
  const vocabIdsByKanji = new Map();

  for (const kanji of allKanji) {
    const hex = kanjiToHex(kanji);
    const officialItem = officialByKanji.get(kanji);
    const localGrade = localGradeMap.get(kanji) || null;
    const info = await loadInfo(hex);
    const sourceUri = `https://kanjiapi.dev/v1/kanji/${encodeURIComponent(kanji)}`;
    const nodeClaims = [];

    if (officialItem) {
      nodeClaims.push(
        claim(
          "officialCurriculumDocument",
          "小学校学習指導要領（平成29年告示）",
          "mext-elementary-course-of-study-2017-pdf",
          "https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2019/09/26/1413522_001.pdf",
          1,
        ),
      );
      nodeClaims.push(claim("officialGrade", officialItem.grade, officialItem.sourceId, officialItem.sourceUri, 1));
      nodeClaims.push(claim("officialSequence", officialItem.sequence, officialItem.sourceId, officialItem.sourceUri, 1));
    }
    if (localGrade) {
      nodeClaims.push(claim("localGrade", localGrade, "kanjiapi-v1-local-grade", `public/data/v1/grades/grade-${localGrade}.json`, 0.8));
    }
    if (info?.stroke_count) {
      nodeClaims.push(claim("strokeCount", info.stroke_count, "kanjiapi-v1-local-info", sourceUri, 0.8));
    }
    if (await exists(path.join(V1_ROOT, "svg", `${hex}.svg`))) {
      nodeClaims.push(claim("strokeOrderSvg", `${hex}.svg`, "kanjivg-local-svg", `public/data/v1/svg/${hex}.svg`, 0.8));
    }

    const readings = readingObjects(kanji, info, sourceUri);
    for (const reading of readings) {
      db.run(
        `INSERT INTO readings (id, kanji, reading_type, reading, provenance_json) VALUES (?, ?, ?, ?, ?)`,
        [reading.id, kanji, reading.type, reading.reading, JSON.stringify(reading.provenance)],
      );
      for (const itemClaim of reading.provenance.claims) {
        insertClaim(db, "reading", reading.id, itemClaim);
      }
    }

    const vocabCandidates = await buildVocabularyForKanji(kanji, officialGradeMap, localGradeMap);
    const kanjiVocabIds = [];
    for (const candidate of vocabCandidates) {
      const id = stableId("vocab", `${candidate.written}|${candidate.reading}`);
      kanjiVocabIds.push(id);
      const sourceWordUri = `https://kanjiapi.dev/v1/words/${encodeURIComponent(kanji)}`;
      const existing = vocabById.get(id);
      if (existing) {
        existing.linkedKanji = Array.from(new Set([...existing.linkedKanji, kanji]));
        continue;
      }
      const vocabClaims = [
        claim("written", candidate.written, "kanjiapi-v1-local-words", sourceWordUri, 0.75),
        claim("reading", candidate.reading, "kanjiapi-v1-local-words", sourceWordUri, 0.75),
        claim("kanjiChars", candidate.kanjiChars, "mext-grade-kanji-2017", "https://w3id.org/jp-cos/8210000100000000", 0.9),
      ];
      const vocab = {
        id,
        type: "vocabulary",
        reviewStatus: "candidate-unreviewed",
        educationSuitability: "needs-review-before-child-facing-use",
        domains: ["vocabulary", "kanji"],
        written: candidate.written,
        reading: candidate.reading,
        meanings: candidate.meanings,
        kanjiChars: candidate.kanjiChars,
        officialMaxGrade: candidate.officialMaxGrade,
        localMaxGrade: candidate.localMaxGrade,
        linkedKanji: [kanji],
        renderPolicy: "show known kanji and kana fallback by profile/known set",
        provenance: provenance(vocabClaims),
      };
      vocabById.set(id, vocab);
    }
    vocabIdsByKanji.set(kanji, kanjiVocabIds);

    const kanjiNode = {
      id: `kanji-${hex}`,
      type: "kanji",
      kanji,
      hex,
      officialGrade: officialItem?.grade || null,
      localGrade,
      officialSequence: officialItem?.sequence || null,
      status: officialItem ? (localGrade ? "official-and-local" : "official-missing-local-mirror") : "local-only",
      strokeCount: info?.stroke_count || null,
      meanings: info?.meanings || [],
      readings,
      vocab: kanjiVocabIds,
      progressions: officialItem
        ? [
            {
              profileId: "grade-only",
              grade: officialItem.grade,
              sequence: officialItem.sequence,
              source_uri: officialItem.sourceUri,
              confidence: 1,
            },
          ]
        : [],
      provenance: provenance(nodeClaims),
    };

    db.run(
      `INSERT INTO kanji
        (id, kanji, hex, official_grade, local_grade, stroke_count, status, provenance_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        kanjiNode.id,
        kanjiNode.kanji,
        kanjiNode.hex,
        kanjiNode.officialGrade,
        kanjiNode.localGrade,
        kanjiNode.strokeCount,
        kanjiNode.status,
        JSON.stringify(kanjiNode.provenance),
      ],
    );
    for (const itemClaim of kanjiNode.provenance.claims) {
      insertClaim(db, "kanji", kanjiNode.id, itemClaim);
    }

    kanjiExports.push(kanjiNode);
    await writeJson(path.join(OUTPUT_ROOT, "kanji", `${hex}.json`), kanjiNode);
  }

  for (const vocab of vocabById.values()) {
    db.run(
      `INSERT INTO vocabulary
        (id, written, reading, official_max_grade, local_max_grade, domains_json, provenance_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        vocab.id,
        vocab.written,
        vocab.reading,
        vocab.officialMaxGrade,
        vocab.localMaxGrade,
        JSON.stringify(vocab.domains),
        JSON.stringify(vocab.provenance),
      ],
    );
    for (const itemClaim of vocab.provenance.claims) {
      insertClaim(db, "vocabulary", vocab.id, itemClaim);
    }
    await writeJson(path.join(OUTPUT_ROOT, "vocab", `${vocab.id}.json`), vocab);
  }

  const exampleExports = SEEDED_EXAMPLES.map((example) => {
    const exampleClaims = [
      claim("canonicalText", example.canonicalText, example.sourceId, example.sourceUri, 0.8),
      claim("readingText", example.readingText, example.sourceId, example.sourceUri, 0.8),
      claim("domains", example.domains, example.sourceId, example.sourceUri, 0.8),
    ];
    return {
      id: example.id,
      type: "example",
      kind: example.kind,
      domains: example.domains,
      canonicalText: example.canonicalText,
      readingText: example.readingText,
      tokens: example.tokens,
      renderings: buildExampleRenderings(example, officialGradeMap),
      provenance: provenance(exampleClaims),
    };
  });

  for (const example of exampleExports) {
    db.run(
      `INSERT INTO examples
        (id, kind, canonical_text, reading_text, domains_json, renderings_json, provenance_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        example.id,
        example.kind,
        example.canonicalText,
        example.readingText,
        JSON.stringify(example.domains),
        JSON.stringify(example.renderings),
        JSON.stringify(example.provenance),
      ],
    );
    for (const itemClaim of example.provenance.claims) {
      insertClaim(db, "example", example.id, itemClaim);
    }
    await writeJson(path.join(OUTPUT_ROOT, "examples", `${example.id}.json`), example);
  }

  const missingOfficialInLocal = officialItems
    .filter((item) => !localGradeMap.has(item.kanji))
    .map((item) => item.kanji);
  const localOnly = localItems
    .filter((item) => !officialByKanji.has(item.kanji))
    .map((item) => item.kanji);
  const gradeMismatches = localItems
    .filter((item) => officialGradeMap.has(item.kanji) && officialGradeMap.get(item.kanji) !== item.grade)
    .map((item) => ({
      kanji: item.kanji,
      localGrade: item.grade,
      officialGrade: officialGradeMap.get(item.kanji),
    }))
    .sort((a, b) => a.officialGrade - b.officialGrade || a.localGrade - b.localGrade || a.kanji.localeCompare(b.kanji, "ja"));
  const coverageByGrade = [];
  for (let grade = 1; grade <= 6; grade += 1) {
    const officialGradeItems = officialItems.filter((item) => item.grade === grade);
    const localGradeItems = localItems.filter((item) => item.grade === grade);
    const vocabLinks = officialGradeItems.reduce((total, item) => total + (vocabIdsByKanji.get(item.kanji)?.length || 0), 0);
    const readingLinks = officialGradeItems.reduce((total, item) => {
      const node = kanjiExports.find((kanjiNode) => kanjiNode.kanji === item.kanji);
      return total + (node?.readings.length || 0);
    }, 0);
    coverageByGrade.push({
      grade,
      officialCount: officialGradeItems.length,
      localCount: localGradeItems.length,
      missingFromLocal: officialGradeItems.filter((item) => !localGradeMap.has(item.kanji)).length,
      vocabLinks,
      readingLinks,
    });
  }

  const searchIndex = {
    generatedAt: GENERATED_AT,
    version: "v2",
    entries: [
      ...kanjiExports.map((node) => ({
        id: node.id,
        type: "kanji",
        text: node.kanji,
        reading: node.readings.map((reading) => reading.reading).join(" "),
        grade: node.officialGrade,
        domains: ["kanji"],
        url: `kanji/${node.hex}.json`,
      })),
      ...Array.from(vocabById.values()).map((node) => ({
        id: node.id,
        type: "vocabulary",
        text: node.written,
        reading: node.reading,
        grade: node.officialMaxGrade,
        domains: node.domains,
        url: `vocab/${node.id}.json`,
      })),
      ...DOMAIN_SEEDS.map((node) => ({
        id: `domain-${node.id}`,
        type: "domain",
        text: node.label,
        reading: "",
        grade: null,
        domains: [node.id],
        url: "domains.json",
      })),
      ...exampleExports.map((node) => ({
        id: node.id,
        type: "example",
        text: node.canonicalText,
        reading: node.readingText,
        grade: null,
        domains: node.domains,
        url: `examples/${node.id}.json`,
      })),
    ],
  };
  await writeJson(path.join(OUTPUT_ROOT, "search-index.json"), searchIndex);

  const counts = {
    officialKanji: officialItems.length,
    localKanji: localItems.length,
    graphKanji: kanjiExports.length,
    vocabulary: vocabById.size,
    examples: exampleExports.length,
    progressionProfiles: 1,
    domains: DOMAIN_SEEDS.length,
    schemaReadyScopes: SCOPE_EXPORTS.length,
    claims: db.query("SELECT COUNT(*) AS count FROM claims").get().count,
  };

  const manifest = {
    id: "kokugo-graph-v2",
    generatedAt: GENERATED_AT,
    version: "v2",
    pipeline: {
      mode: "offline-build-from-mirrors",
      networkPolicy: "graph build/export/check do not fetch upstream sources",
      refreshCommand: "bun run mirror:sources && bun run graph:build && bun run graph:check",
      productContract: "runtime code reads static JSON under public/data/v2/graph only",
      artifactDistribution: [
        "git repository",
        "static web hosting",
        "object storage such as Cloudflare R2, S3, Backblaze B2, or compatible mirrors",
        "CDN or community mirror that can serve immutable JSON files",
      ],
    },
    curriculumRoot: {
      authority: "文部科学省",
      claim: "小学校学習指導要領（平成29年告示）を国語グラフの基準点にする",
      sourceId: "mext-elementary-course-of-study-2017-pdf",
      sourceUri:
        "https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2019/09/26/1413522_001.pdf",
      lodSourceId: "mext-grade-kanji-2017",
      lodSourceUri: "https://w3id.org/jp-cos/8210000100000000",
    },
    sqlite: {
      path: path.relative(ROOT, DB_PATH),
      note: "Build artifact; gitignored. Static JSON exports are committed.",
    },
    sources: sourceDefinitions(rawSources).map((source) => ({
      id: source.id,
      label: source.label,
      kind: source.kind,
      canonicalUri: source.canonicalUri || source.url || null,
      path: source.path || null,
      license: source.license || null,
      attribution: source.attribution || null,
    })),
    exports: {
      kanji: "kanji/{hex}.json",
      vocab: "vocab/{id}.json",
      examples: "examples/{id}.json",
      progressions: "progressions/{id}.json",
      grammar: "grammar/{id}.json",
      readings: "readings/{id}.json",
      classical: "classical/{id}.json",
      sayings: "sayings/{id}.json",
      yojijukugo: "yojijukugo/{id}.json",
      searchIndex: "search-index.json",
    },
    counts,
    coverage: {
      officialTotal: officialData.totalCount,
      officialExpectedTotal: OFFICIAL_TOTAL,
      currentLocalTotal: localManifest.kanjiCount,
      missingOfficialInLocal,
      localOnly,
      gradeMismatches,
      byGrade: coverageByGrade,
    },
    notes: [
      "The grade-only progression is official grade eligibility plus allocation-table position; it is not a publisher lesson sequence.",
      "Publisher progressions are intentionally absent until enough source data is derived from 教科書LOD or publisher material.",
      "Grammar, reading practice, classical Japanese, sayings, and 四字熟語 are represented as first-class graph domains now, with scope exports ready for future population.",
      "LLM-generated examples should be produced offline, reviewed, and committed as static example nodes.",
    ],
  };
  await writeJson(path.join(OUTPUT_ROOT, "manifest.json"), manifest);

  const report = [
    "# Kokugo Graph Coverage",
    "",
    `Generated: ${GENERATED_AT}`,
    "",
    "## Summary",
    "",
    `- Official JP-COS elementary kanji: ${counts.officialKanji}/${OFFICIAL_TOTAL}`,
    `- Current local v1 kanji mirror: ${counts.localKanji}`,
    `- Graph kanji nodes: ${counts.graphKanji}`,
    `- Vocabulary nodes: ${counts.vocabulary}`,
    `- Example nodes: ${counts.examples}`,
    `- Domains: ${counts.domains} (${DOMAIN_SEEDS.map((domain) => domain.label).join(", ")})`,
    `- Claims with provenance in SQLite: ${counts.claims}`,
    "",
    "## Migration Gap",
    "",
    `The current local app dataset has ${localManifest.kanjiCount} kanji. The current official JP-COS elementary allocation has ${officialData.totalCount} kanji, so the local mirror is short by ${missingOfficialInLocal.length} kanji.`,
    "",
    missingOfficialInLocal.length
      ? `Missing official kanji in local v1 mirror: ${missingOfficialInLocal.join(" ")}`
      : "Missing official kanji in local v1 mirror: none",
    "",
    `Local-vs-official grade assignment mismatches among shared kanji: ${gradeMismatches.length}`,
    "",
    gradeMismatches.length
      ? `Mismatched shared kanji: ${gradeMismatches
          .map((item) => `${item.kanji}(local ${item.localGrade}, official ${item.officialGrade})`)
          .join(" ")}`
      : "Mismatched shared kanji: none",
    "",
    "## Grade Coverage",
    "",
    "| Grade | Official | Local v1 | Missing Local | Vocab Links | Reading Links |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...coverageByGrade.map(
      (row) =>
        `| ${row.grade} | ${row.officialCount} | ${row.localCount} | ${row.missingFromLocal} | ${row.vocabLinks} | ${row.readingLinks} |`,
    ),
    "",
    "## Progressions",
    "",
    "- `grade-only`: official grade eligibility from 学習指導要領LOD. Its `sequence` is the allocation-table position, not a classroom lesson order.",
    "- Publisher profiles such as 光村図書, 東京書籍, and 教育出版 are reserved as overlays and should be added only after source-backed sequence data exists.",
    "",
    "## Wider 国語 Surface",
    "",
    "| Domain | Status | Next Population Source |",
    "| --- | --- | --- |",
    ...DOMAIN_SEEDS.map((domain) => `| ${domain.label} | ${domain.status} | ${domain.sourceIds.join(", ")} |`),
    "",
    "## Example Rendering Check",
    "",
    "- Canonical: 五月に卒業した",
    "- Reading: ごがつにそつぎょうした",
    "- Known `五` only demo: 五がつにそつぎょうした",
    "- Grade-only grade 1 rendering shows all grade-1-known kanji; publisher/custom progressions can be stricter within a grade.",
    "- Vocabulary exports are candidate/unreviewed graph nodes until kid-facing curation rules are added.",
    "",
    "## Source Policy",
    "",
    "- Government curriculum data is mirrored as the baseline public claim.",
    "- Every generated node carries source-backed provenance claims or a local seed provenance marker.",
    "- Textbook and publisher-derived ordering is modeled as advisory overlay data, not global truth.",
    "",
    "## Pipeline Boundary",
    "",
    "- `mirror:sources` is the only networked source collection command.",
    "- `graph:build`, `graph:export`, and `graph:check` are offline and read local mirrors/static data.",
    "- Runtime product code should consume only `public/data/v2/graph` JSON or an equivalent static mirror.",
    "- The graph artifact is provider-neutral and can be hosted from Git, static hosting, R2, S3-compatible storage, Backblaze B2, GitHub Releases, or community mirrors.",
    "",
  ].join("\n");
  await fs.writeFile(REPORT_PATH, report, "utf8");

  db.close();
  console.log(`built graph: ${counts.graphKanji} kanji, ${counts.vocabulary} vocabulary nodes`);
  console.log(`exported ${path.relative(ROOT, OUTPUT_ROOT)}`);
  console.log(`wrote ${path.relative(ROOT, REPORT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
