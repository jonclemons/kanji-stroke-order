import { APP_VERSION, DATA_VERSION } from "../src/version.js";

const base = process.argv[2];

if (!base) {
  console.error("Usage: bun run smoke:worker -- https://<host>");
  process.exit(1);
}

const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);

async function expectEndpoint(pathname, assertion) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url);
  await assertion(response, url);
}

function assertOk(response, url) {
  if (!response.ok) {
    throw new Error(`${url.pathname} returned ${response.status}`);
  }
}

await expectEndpoint("/", async (response, url) => {
  assertOk(response, url);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("text/html")) {
    throw new Error(`/ returned ${contentType || "no content-type"}`);
  }
  if (!text.includes("かんじれんしゅう")) {
    throw new Error("/ did not contain the app shell");
  }
});

await expectEndpoint("/manifest.json", async (response, url) => {
  assertOk(response, url);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`/manifest.json returned ${contentType || "no content-type"}`);
  }
});

await expectEndpoint("/data/v1/grades/grade-1.json", async (response, url) => {
  assertOk(response, url);
  const contentType = response.headers.get("content-type") || "";
  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error("/data/v1/grades/grade-1.json returned an unexpected payload");
  }
  if (!contentType.includes("application/json")) {
    throw new Error(`/data/v1/grades/grade-1.json returned ${contentType || "no content-type"}`);
  }
});

await expectEndpoint("/api/health", async (response, url) => {
  assertOk(response, url);
  const payload = await response.json();
  if (payload.appVersion !== APP_VERSION) {
    throw new Error(`/api/health appVersion mismatch: expected ${APP_VERSION}, got ${payload.appVersion}`);
  }
  if (payload.dataVersion !== DATA_VERSION) {
    throw new Error(`/api/health dataVersion mismatch: expected ${DATA_VERSION}, got ${payload.dataVersion}`);
  }
});

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl: baseUrl.origin,
      appVersion: APP_VERSION,
      dataVersion: DATA_VERSION,
    },
    null,
    2,
  ),
);
