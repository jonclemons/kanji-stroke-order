import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".gz", "application/gzip"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".pdf", "application/pdf"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".xml", "application/xml; charset=utf-8"],
]);

export function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const key = token.slice(2);
    if (key === "dry-run") {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

export function requiredArg(args, key, envKey = key.toUpperCase().replaceAll("-", "_")) {
  const value = args[key] || process.env[envKey];
  if (!value) {
    throw new Error(`Missing required --${key} or ${envKey}`);
  }
  return value;
}

export function contentTypeFor(filePath) {
  return CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) || DEFAULT_CONTENT_TYPE;
}

export function normalizePrefix(prefix = "") {
  return prefix.replace(/^\/+|\/+$/g, "");
}

export function normalizeObjectKey(...parts) {
  return parts
    .filter(Boolean)
    .join("/")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "");
}

export async function listFiles(root) {
  const files = [];

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }

  await visit(root);
  return files;
}

function quoteArg(value) {
  if (/^[a-zA-Z0-9_./:=@%+,-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

async function commandExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function wranglerCommand() {
  const extension = process.platform === "win32" ? ".cmd" : "";
  const localWrangler = path.join(process.cwd(), "node_modules", ".bin", `wrangler${extension}`);
  if (await commandExists(localWrangler)) {
    return { command: localWrangler, baseArgs: [] };
  }

  return { command: "bunx", baseArgs: ["wrangler"] };
}

export async function runWrangler(args, { dryRun = false } = {}) {
  const { command, baseArgs } = await wranglerCommand();
  const commandArgs = [...baseArgs, ...args];

  if (dryRun) {
    console.log(`[dry-run] ${[command, ...commandArgs].map(quoteArg).join(" ")}`);
    return;
  }

  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `wrangler exited with ${code}\n${stdout.trim()}\n${stderr.trim()}`.trim(),
        ),
      );
    });
  });
}

export function r2PutArgs({ bucket, key, file, contentType, cacheControl }) {
  const args = [
    "r2",
    "object",
    "put",
    `${bucket}/${key}`,
    "--file",
    file,
    "--remote",
    "--force",
    "--content-type",
    contentType || contentTypeFor(file),
  ];

  if (cacheControl) {
    args.push("--cache-control", cacheControl);
  }

  return args;
}
