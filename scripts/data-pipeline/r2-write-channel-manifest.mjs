#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeObjectKey,
  normalizePrefix,
  parseArgs,
  r2PutArgs,
  requiredArg,
  runWrangler,
} from "./r2-utils.mjs";

const DEFAULT_BASE_URL = "https://data.kokugo.app";
const DEFAULT_CHANNEL_CACHE = "public, max-age=60, must-revalidate";

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = requiredArg(args, "bucket", "R2_BUCKET");
  const channel = requiredArg(args, "channel", "KOKUGO_GRAPH_CHANNEL");
  const buildId = requiredArg(args, "build-id", "KOKUGO_GRAPH_BUILD_ID");
  const baseUrl = (args["base-url"] || process.env.GRAPH_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/g,
    "",
  );
  const graphPrefix = normalizePrefix(
    args["graph-prefix"] || process.env.KOKUGO_GRAPH_PREFIX || `v2/builds/${buildId}/graph`,
  );
  const channelKey = normalizeObjectKey("v2", "channels", channel, "manifest.json");
  const outputPath = path.join(process.cwd(), "build", "r2-channel-manifests", `${channel}.json`);
  const now = new Date().toISOString();
  const manifest = {
    id: "kokugo-graph-channel",
    manifestVersion: 1,
    channel,
    buildId,
    publishedAt: now,
    graphPrefix,
    graphBaseUrl: `${baseUrl}/${graphPrefix}/`,
    graphManifestUrl: `${baseUrl}/${graphPrefix}/manifest.json`,
    immutableBuildUrl: `${baseUrl}/${graphPrefix}/manifest.json`,
    channelManifestUrl: `${baseUrl}/${channelKey}`,
    cachePolicy:
      "Channel manifests are short-lived pointers. Graph files under build prefixes are immutable.",
    promotionPolicy: "Manual validation is required before writing the prod channel manifest.",
  };

  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  await runWrangler(
    r2PutArgs({
      bucket,
      key: channelKey,
      file: outputPath,
      contentType: "application/json; charset=utf-8",
      cacheControl: args["cache-control"] || DEFAULT_CHANNEL_CACHE,
    }),
    { dryRun: Boolean(args["dry-run"]) },
  );

  console.log(`${channel} channel manifest -> r2://${bucket}/${channelKey}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
