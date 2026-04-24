#!/usr/bin/env node
import { parseArgs, r2PutArgs, requiredArg, runWrangler } from "./r2-utils.mjs";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bucket = requiredArg(args, "bucket", "R2_BUCKET");
  const key = requiredArg(args, "key", "R2_OBJECT_KEY");
  const file = requiredArg(args, "file", "R2_FILE");
  const cacheControl = args["cache-control"] || process.env.R2_CACHE_CONTROL;
  const contentType = args["content-type"] || process.env.R2_CONTENT_TYPE;

  await runWrangler(
    r2PutArgs({
      bucket,
      key,
      file,
      contentType,
      cacheControl,
    }),
    { dryRun: Boolean(args["dry-run"]) },
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
