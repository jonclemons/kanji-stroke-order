#!/usr/bin/env node
import { parseArgs } from "./r2-utils.mjs";

const EXPECTED_OFFICIAL_KANJI = 1026;
const EXPECTED_LOCAL_KANJI = 1006;

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function channelManifestUrl(baseUrl, channel) {
  const trimmed = baseUrl.replace(/\/+$/g, "");
  if (trimmed.includes("/v2/channels/") || trimmed.includes("/v2/builds/")) {
    return new URL("manifest.json", ensureTrailingSlash(trimmed)).href;
  }

  return `${trimmed}/v2/channels/${channel}/manifest.json`;
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${response.statusText} ${url}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) {
    console.warn(`${label} content-type is ${contentType || "missing"}; expected JSON`);
  }

  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = args["base-url"] || process.env.GRAPH_BASE_URL || "https://data.kokugo.app";
  const channel = args.channel || process.env.KOKUGO_GRAPH_CHANNEL || "staging";
  const channelUrl = channelManifestUrl(baseUrl, channel);
  const channelManifest = await fetchJson(channelUrl, "channel manifest");
  const graphBaseUrl = ensureTrailingSlash(channelManifest.graphBaseUrl || baseUrl);
  const graphManifestUrl =
    channelManifest.graphManifestUrl || new URL("manifest.json", graphBaseUrl).href;
  const graphManifest = await fetchJson(graphManifestUrl, "graph manifest");

  if (graphManifest.counts?.officialKanji !== EXPECTED_OFFICIAL_KANJI) {
    throw new Error(
      `officialKanji count ${graphManifest.counts?.officialKanji}; expected ${EXPECTED_OFFICIAL_KANJI}`,
    );
  }

  if (graphManifest.counts?.localKanji !== EXPECTED_LOCAL_KANJI) {
    throw new Error(
      `localKanji count ${graphManifest.counts?.localKanji}; expected ${EXPECTED_LOCAL_KANJI}`,
    );
  }

  const searchIndex = await fetchJson(new URL("search-index.json", graphBaseUrl).href, "search index");
  const firstVocab = searchIndex.entries?.find((entry) => entry.type === "vocab");
  if (!firstVocab?.url) {
    throw new Error("search-index.json has no vocab entry to smoke test");
  }

  await fetchJson(new URL("kanji/04e94.json", graphBaseUrl).href, "kanji node");
  await fetchJson(new URL(firstVocab.url, graphBaseUrl).href, "vocab node");
  await fetchJson(
    new URL("examples/example-gogatsu-sotsugyou.json", graphBaseUrl).href,
    "example node",
  );

  console.log(
    `R2 graph check passed: ${channel} -> ${channelManifest.buildId || "direct graph"} (${graphManifest.counts.officialKanji} official kanji)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
