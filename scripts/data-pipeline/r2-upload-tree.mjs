#!/usr/bin/env node
import path from "node:path";
import {
  contentTypeFor,
  listFiles,
  normalizeObjectKey,
  normalizePrefix,
  parseArgs,
  r2PutArgs,
  requiredArg,
  runWrangler,
} from "./r2-utils.mjs";

const DEFAULT_CONCURRENCY = 2;

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function runPool(tasks, concurrency) {
  let nextIndex = 0;
  let completed = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      await tasks[index]();
      completed += 1;
      if (completed === tasks.length || completed % 100 === 0) {
        console.log(`uploaded ${completed}/${tasks.length} objects`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = requiredArg(args, "bucket", "R2_BUCKET");
  const root = path.resolve(requiredArg(args, "root", "R2_UPLOAD_ROOT"));
  const prefix = normalizePrefix(requiredArg(args, "prefix", "R2_PREFIX"));
  const cacheControl = args["cache-control"] || process.env.R2_CACHE_CONTROL;
  const dryRun = Boolean(args["dry-run"]);
  const concurrency = toPositiveInteger(process.env.R2_UPLOAD_CONCURRENCY, DEFAULT_CONCURRENCY);
  const files = await listFiles(root);

  if (files.length === 0) {
    throw new Error(`No files found under ${root}`);
  }

  console.log(
    `${dryRun ? "would upload" : "uploading"} ${files.length} files to r2://${bucket}/${prefix}`,
  );

  const tasks = files.map((file, index) => {
    const relativePath = path.relative(root, file).replace(/\\/g, "/");
    const key = normalizeObjectKey(prefix, relativePath);
    const wranglerArgs = r2PutArgs({
      bucket,
      key,
      file,
      contentType: contentTypeFor(file),
      cacheControl,
    });

    return async () => {
      if (dryRun && index >= 20) {
        return;
      }
      await runWrangler(wranglerArgs, { dryRun });
    };
  });

  if (dryRun) {
    await runPool(tasks.slice(0, Math.min(tasks.length, 20)), 1);
    if (files.length > 20) {
      console.log(`[dry-run] skipped ${files.length - 20} additional upload commands`);
    }
    return;
  }

  await runPool(tasks, concurrency);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
