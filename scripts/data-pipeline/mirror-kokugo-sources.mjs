import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const RAW_ROOT = path.join(process.cwd(), "data", "raw", "kokugo-sources");
const GENERATED_AT = new Date().toISOString();
const SOURCE_CONTACT = process.env.KOKUGO_SOURCE_CONTACT || "https://kokugo.app";
const USER_AGENT =
  process.env.KOKUGO_SOURCE_USER_AGENT || `kokugo-app-graph-mirror/0.1 (${SOURCE_CONTACT})`;

const JP_COS_GRADE_PAGES = [
  {
    id: "mext-cos-2017-grade-1-kanji",
    grade: 1,
    expectedCount: 80,
    url: "https://jp-cos.github.io/821/0010110000000",
    canonicalUri: "https://w3id.org/jp-cos/8210010110000000",
  },
  {
    id: "mext-cos-2017-grade-2-kanji",
    grade: 2,
    expectedCount: 160,
    url: "https://jp-cos.github.io/821/0020120000000",
    canonicalUri: "https://w3id.org/jp-cos/8210020120000000",
  },
  {
    id: "mext-cos-2017-grade-3-kanji",
    grade: 3,
    expectedCount: 200,
    url: "https://jp-cos.github.io/821/0030130000000",
    canonicalUri: "https://w3id.org/jp-cos/8210030130000000",
  },
  {
    id: "mext-cos-2017-grade-4-kanji",
    grade: 4,
    expectedCount: 202,
    url: "https://jp-cos.github.io/821/0040140000000",
    canonicalUri: "https://w3id.org/jp-cos/8210040140000000",
  },
  {
    id: "mext-cos-2017-grade-5-kanji",
    grade: 5,
    expectedCount: 193,
    url: "https://jp-cos.github.io/821/0050150000000",
    canonicalUri: "https://w3id.org/jp-cos/8210050150000000",
  },
  {
    id: "mext-cos-2017-grade-6-kanji",
    grade: 6,
    expectedCount: 191,
    url: "https://jp-cos.github.io/821/0060160000000",
    canonicalUri: "https://w3id.org/jp-cos/8210060160000000",
  },
];

const SOURCE_SNAPSHOTS = [
  {
    id: "mext-elementary-course-of-study-2017-pdf",
    label: "小学校学習指導要領（平成29年告示）",
    kind: "official-government-curriculum",
    url: "https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2019/09/26/1413522_001.pdf",
    canonicalUri:
      "https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2019/09/26/1413522_001.pdf",
    license: "Public government curriculum document",
    attribution: "文部科学省",
    outputPath: "mext/elementary-course-of-study-2017.source.json",
    metadataOnly: true,
  },
  {
    id: "mext-elementary-kokugo-commentary-2022-pdf",
    label: "小学校学習指導要領（平成29年告示）解説 国語編",
    kind: "official-government-curriculum-commentary",
    url: "https://www.mext.go.jp/content/20220606-mxt_kyoiku02-100002607_002.pdf",
    canonicalUri: "https://www.mext.go.jp/content/20220606-mxt_kyoiku02-100002607_002.pdf",
    license: "Public government curriculum document",
    attribution: "文部科学省",
    outputPath: "mext/elementary-kokugo-commentary-2022.source.json",
    metadataOnly: true,
  },
  {
    id: "jp-cos-about",
    label: "学習指導要領LOD About",
    kind: "source-description",
    url: "https://jp-cos.github.io/about.html",
    canonicalUri: "https://jp-cos.github.io/about.html",
    license: "CC BY 4.0",
    attribution: "学習指導要領LOD",
    outputPath: "jp-cos/about.html",
  },
  {
    id: "jp-cos-all-20250927",
    label: "学習指導要領LOD TTL snapshot",
    kind: "rdf-snapshot",
    url: "https://w3id.org/jp-cos/all-20250927.ttl.gz",
    canonicalUri: "https://w3id.org/jp-cos/all-20250927.ttl.gz",
    license: "CC BY 4.0",
    attribution: "学習指導要領LOD",
    outputPath: "jp-cos/all-20250927.ttl.gz",
  },
  {
    id: "jp-textbook-about",
    label: "教科書LOD About",
    kind: "source-description",
    url: "https://jp-textbook.github.io/about.html",
    canonicalUri: "https://jp-textbook.github.io/about.html",
    license: "CC0 1.0",
    attribution: "教科書LOD",
    outputPath: "jp-textbook/about.html",
  },
  {
    id: "jp-textbook-all-textbook-20260407",
    label: "教科書LOD textbook TTL snapshot",
    kind: "rdf-snapshot",
    url: "https://w3id.org/jp-textbook/all-textbook-20260407.ttl.gz",
    canonicalUri: "https://w3id.org/jp-textbook/all-textbook-20260407.ttl.gz",
    license: "CC0 1.0",
    attribution: "教科書LOD",
    outputPath: "jp-textbook/all-textbook-20260407.ttl.gz",
  },
  {
    id: "jp-textbook-all-teaching-unit-20260407",
    label: "教科書LOD teaching unit TTL snapshot",
    kind: "rdf-snapshot",
    url: "https://w3id.org/jp-textbook/all-teachingUnit-20260407.ttl.gz",
    canonicalUri: "https://w3id.org/jp-textbook/all-teachingUnit-20260407.ttl.gz",
    license: "CC0 1.0",
    attribution: "教科書LOD",
    outputPath: "jp-textbook/all-teachingUnit-20260407.ttl.gz",
  },
];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

class SourceBlockedError extends Error {
  constructor({ sourceId, url, status, statusText, retryAfter }) {
    super(`Source ${sourceId} stopped at ${url}: ${status} ${statusText}`);
    this.name = "SourceBlockedError";
    this.sourceId = sourceId;
    this.url = url;
    this.status = status;
    this.statusText = statusText;
    this.retryAfter = retryAfter;
  }
}

async function writeSourceStatus(value) {
  await writeJson(path.join(RAW_ROOT, "source-status.json"), {
    generatedAt: GENERATED_AT,
    userAgent: USER_AGENT,
    contact: SOURCE_CONTACT,
    ...value,
  });
}

async function fetchBytes(url, { retries = 3, sourceId = url } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": USER_AGENT,
        },
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) {
          throw new SourceBlockedError({
            sourceId,
            url,
            status: response.status,
            statusText: response.statusText,
            retryAfter: response.headers.get("retry-after"),
          });
        }
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof SourceBlockedError) {
        throw error;
      }
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }

  throw new Error(`Failed to fetch ${url}: ${lastError?.message || "unknown error"}`);
}

function extractGradeKanji(html) {
  const items = [];
  const itemRegex =
    /itemprop="http:\/\/schema\.org\/hasPart"\s+itemid="https:\/\/w3id\.org\/jp-cos\/([^"]+)"[^>]*>\s*<a href="[^"]+">([^<]+)<\/a>/g;

  for (const match of html.matchAll(itemRegex)) {
    const [, code, label] = match;
    const chars = Array.from(label.trim());
    if (chars.length !== 1 || !/\p{Script=Han}/u.test(chars[0])) {
      continue;
    }

    items.push({
      kanji: chars[0],
      sequence: items.length + 1,
      sourceUri: `https://w3id.org/jp-cos/${code}`,
    });
  }

  return items;
}

async function mirrorSnapshot(source) {
  if (source.metadataOnly) {
    const response = await fetch(source.url, {
      method: "HEAD",
      headers: {
        "user-agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new SourceBlockedError({
          sourceId: source.id,
          url: source.url,
          status: response.status,
          statusText: response.statusText,
          retryAfter: response.headers.get("retry-after"),
        });
      }
      throw new Error(`Failed to fetch metadata for ${source.url}: ${response.status} ${response.statusText}`);
    }

    const metadata = {
      id: source.id,
      label: source.label,
      kind: source.kind,
      url: source.url,
      canonicalUri: source.canonicalUri,
      license: source.license,
      attribution: source.attribution,
      mirroredAt: GENERATED_AT,
      mirrorType: "metadata-only",
      headers: {
        contentType: response.headers.get("content-type"),
        contentLength: response.headers.get("content-length"),
        lastModified: response.headers.get("last-modified"),
        etag: response.headers.get("etag"),
      },
      note: "Official MEXT PDF is kept as remote authority metadata to avoid committing large binary curriculum PDFs.",
    };
    const bytes = Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`, "utf8");
    const outputPath = path.join(RAW_ROOT, source.outputPath);
    await ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, bytes);

    return {
      ...source,
      path: path.relative(process.cwd(), outputPath),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      mirroredAt: GENERATED_AT,
    };
  }

  const bytes = await fetchBytes(source.url, { sourceId: source.id });
  const outputPath = path.join(RAW_ROOT, source.outputPath);
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, bytes);

  return {
    ...source,
    path: path.relative(process.cwd(), outputPath),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    mirroredAt: GENERATED_AT,
  };
}

async function mirrorGradePage(page) {
  const bytes = await fetchBytes(page.url, { sourceId: page.id });
  const html = bytes.toString("utf8");
  const htmlPath = path.join(RAW_ROOT, "jp-cos", "grade-kanji", `grade-${page.grade}.html`);
  await ensureDir(path.dirname(htmlPath));
  await fs.writeFile(htmlPath, html, "utf8");

  const items = extractGradeKanji(html);
  if (items.length !== page.expectedCount) {
    throw new Error(
      `Expected ${page.expectedCount} kanji for grade ${page.grade}, parsed ${items.length}`,
    );
  }

  return {
    id: page.id,
    label: `小学校学習指導要領 2017 学年別漢字配当表 ${page.grade}年`,
    kind: "curriculum-grade-kanji-page",
    grade: page.grade,
    expectedCount: page.expectedCount,
    count: items.length,
    url: page.url,
    canonicalUri: page.canonicalUri,
    license: "CC BY 4.0",
    attribution: "学習指導要領LOD",
    path: path.relative(process.cwd(), htmlPath),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    mirroredAt: GENERATED_AT,
    items,
  };
}

async function main() {
  await ensureDir(RAW_ROOT);

  const mirroredSources = [];
  for (const source of SOURCE_SNAPSHOTS) {
    const mirrored = await mirrorSnapshot(source);
    mirroredSources.push(mirrored);
    console.log(`mirrored ${source.id}: ${mirrored.bytes} bytes`);
  }

  const gradePages = [];
  for (const page of JP_COS_GRADE_PAGES) {
    const mirrored = await mirrorGradePage(page);
    gradePages.push(mirrored);
    mirroredSources.push({
      id: mirrored.id,
      label: mirrored.label,
      kind: mirrored.kind,
      url: mirrored.url,
      canonicalUri: mirrored.canonicalUri,
      license: mirrored.license,
      attribution: mirrored.attribution,
      path: mirrored.path,
      bytes: mirrored.bytes,
      sha256: mirrored.sha256,
      mirroredAt: mirrored.mirroredAt,
    });
    console.log(`mirrored JP-COS grade ${page.grade}: ${mirrored.count} kanji`);
  }

  const grades = Object.fromEntries(
    gradePages.map((page) => [
      String(page.grade),
      page.items.map((item) => ({
        ...item,
        grade: page.grade,
        sourceId: page.id,
      })),
    ]),
  );
  const totalCount = Object.values(grades).reduce((total, items) => total + items.length, 0);
  const gradeData = {
    id: "mext-grade-kanji-2017",
    label: "小学校学習指導要領 2017 学年別漢字配当表",
    sourceId: "jp-cos-all-20250927",
    canonicalUri: "https://w3id.org/jp-cos/8210000100000000",
    license: "CC BY 4.0",
    attribution: "学習指導要領LOD",
    generatedAt: GENERATED_AT,
    totalCount,
    expectedTotalCount: JP_COS_GRADE_PAGES.reduce((total, page) => total + page.expectedCount, 0),
    grades,
  };
  const gradeDataPath = path.join(RAW_ROOT, "derived", "mext-grade-kanji-2017.json");
  await writeJson(gradeDataPath, gradeData);

  const gradeBytes = await fs.readFile(gradeDataPath);
  const manifest = {
    id: "kokugo-source-mirror",
    generatedAt: GENERATED_AT,
    rawRoot: path.relative(process.cwd(), RAW_ROOT),
    sources: mirroredSources,
    derived: [
      {
        id: gradeData.id,
        label: gradeData.label,
        path: path.relative(process.cwd(), gradeDataPath),
        count: gradeData.totalCount,
        sha256: sha256(gradeBytes),
        bytes: gradeBytes.byteLength,
        generatedAt: GENERATED_AT,
      },
    ],
    notes: [
      "JP-COS grade pages are mirrored as the authoritative official curriculum allocation layer.",
      "教科書LOD snapshots are mirrored now so publisher and unit overlays can be derived later without changing graph shape.",
    ],
  };

  await writeJson(path.join(RAW_ROOT, "manifest.json"), manifest);
  await writeSourceStatus({
    status: "ok",
    sourceCount: mirroredSources.length,
    officialKanjiCount: totalCount,
    fallbackPolicy:
      "Alternate runners require manual approval, same user-agent/contact, and a lower request rate.",
  });
  console.log(`kokugo source mirror complete: ${totalCount} official elementary kanji`);
}

main().catch(async (error) => {
  if (error instanceof SourceBlockedError) {
    await writeSourceStatus({
      status: error.status === 429 ? "rate-limited" : "blocked",
      sourceId: error.sourceId,
      sourceUrl: error.url,
      statusCode: error.status,
      statusText: error.statusText,
      retryAfter: error.retryAfter,
      fallbackPolicy:
        "Stop this source, preserve last-good snapshots, and require cooldown plus manual approval before using an alternate runner.",
    });
  }
  console.error(error);
  process.exitCode = 1;
});
