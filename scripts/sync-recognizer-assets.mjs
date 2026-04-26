#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = process.cwd();
const releaseZipUrl = "https://github.com/CaptainDario/DaKanji-Single-Kanji-Recognition/releases/download/v1.2/v1.2.zip";
const defaultBucketName = "kanji-recognizer-assets";
const r2Prefix = "dakanji/v1.2-browser64";
const browserInputShape = [1, 64, 64, 1];
const wasmSourceDir = path.join(root, "node_modules", "@tensorflow", "tfjs-tflite", "wasm");
const wasmTargetDir = path.join(root, "public", "recognizer-wasm");
const vendorFiles = [
  {
    name: "tf-core.min.js",
    source: path.join(root, "node_modules", "@tensorflow", "tfjs-core", "dist", "tf-core.min.js"),
  },
  {
    name: "tf-backend-cpu.min.js",
    source: path.join(root, "node_modules", "@tensorflow", "tfjs-backend-cpu", "dist", "tf-backend-cpu.min.js"),
  },
  {
    name: "tf-tflite.min.js",
    source: path.join(root, "node_modules", "@tensorflow", "tfjs-tflite", "dist", "tf-tflite.min.js"),
  },
];
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const bucketName = optionValue("--bucket") || process.env.RECOGNIZER_R2_BUCKET || defaultBucketName;

if (args.has("--help")) {
  printUsage();
  process.exit(0);
}

const shouldCopyWasm = args.has("--copy-wasm") || !args.has("--upload-r2");
const shouldUploadR2 = args.has("--upload-r2");

if (shouldCopyWasm) {
  await copyTfliteWasmAssets();
}

if (shouldUploadR2) {
  await uploadDaKanjiAssets();
}

async function copyTfliteWasmAssets() {
  await mkdir(wasmTargetDir, { recursive: true });
  const files = await readdir(wasmSourceDir);
  const assetFiles = files.filter((file) => file.endsWith(".wasm") || file.endsWith(".js"));

  await Promise.all(assetFiles.map((file) => {
    return cp(path.join(wasmSourceDir, file), path.join(wasmTargetDir, file));
  }));

  await Promise.all(vendorFiles.map((file) => {
    return cp(file.source, path.join(wasmTargetDir, file.name));
  }));

  console.log(`Copied ${assetFiles.length} TFJS-TFLite WASM assets to public/recognizer-wasm`);
  console.log(`Copied ${vendorFiles.length} TensorFlow browser runtime files to public/recognizer-wasm`);
}

async function uploadDaKanjiAssets() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "kanji-recognizer-"));

  try {
    const zipPath = path.join(tempDir, "dakanji-v1.2.zip");
    const modelPath = path.join(tempDir, "model.tflite");
    const labelsPath = path.join(tempDir, "labels.txt");

    console.log(`Downloading ${releaseZipUrl}`);
    const response = await fetch(releaseZipUrl);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    await writeFile(zipPath, Buffer.from(await response.arrayBuffer()));
    const entries = await listZipEntries(zipPath);
    const modelEntry = entries.find((entry) => entry.endsWith("/model.tflite") || entry === "model.tflite");
    const labelsEntry = entries.find((entry) => entry.endsWith("/labels.txt") || entry === "labels.txt");

    if (!modelEntry || !labelsEntry) {
      throw new Error("Could not find model.tflite and labels.txt in the DaKanji release zip");
    }

    await extractZipEntry(zipPath, modelEntry, modelPath);
    await extractZipEntry(zipPath, labelsEntry, labelsPath);
    await normalizeTfliteInputShape(modelPath, browserInputShape);

    await run("bunx", [
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucketName}/${r2Prefix}/model.tflite`,
      "--remote",
      "--file",
      modelPath,
    ]);
    await run("bunx", [
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucketName}/${r2Prefix}/labels.txt`,
      "--remote",
      "--file",
      labelsPath,
    ]);

    console.log(`Uploaded DaKanji v1.2 recognizer assets to R2 bucket ${bucketName}`);
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function listZipEntries(zipPath) {
  const { stdout } = await execFile("unzip", ["-Z1", zipPath], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  return stdout.split(/\r?\n/).filter(Boolean);
}

async function extractZipEntry(zipPath, entry, targetPath) {
  const { stdout } = await execFile("unzip", ["-p", zipPath, entry], {
    encoding: "buffer",
    maxBuffer: 128 * 1024 * 1024,
  });

  await writeFile(targetPath, stdout);
}

async function normalizeTfliteInputShape(modelPath, expectedShape) {
  const buffer = await readFile(modelPath);
  const root = readUInt32(buffer, 0);
  const subgraphs = tableVector(buffer, root, 2);
  const mainSubgraph = subgraphs[0];
  if (!mainSubgraph) throw new Error("Could not find a main subgraph in the TFLite model");

  const inputIndexes = intVector(buffer, mainSubgraph, 1)?.values || [];
  const tensors = tableVector(buffer, mainSubgraph, 0);
  const inputTensor = tensors[inputIndexes[0]];
  if (!inputTensor) throw new Error("Could not find the TFLite input tensor");

  const shape = intVector(buffer, inputTensor, 0);
  const shapeSignature = intVector(buffer, inputTensor, 7);
  if (!shape || shape.values.length !== expectedShape.length) {
    throw new Error(`Unexpected TFLite input shape: ${shape?.values.join(",") || "missing"}`);
  }

  const canResize = shapeSignature?.values.every((value, index) => value === -1 || value === expectedShape[index]);
  if (!canResize) {
    throw new Error(`TFLite input shape signature does not allow ${expectedShape.join(",")}`);
  }

  expectedShape.forEach((value, index) => {
    buffer.writeInt32LE(value, shape.valuesOffset + index * 4);
  });

  await writeFile(modelPath, buffer);
  console.log(`Patched TFLite browser input shape from ${shape.values.join(",")} to ${expectedShape.join(",")}`);
}

function tableField(buffer, tableOffset, fieldIndex) {
  const vtableOffset = tableOffset - readInt32(buffer, tableOffset);
  const vtableLength = readUInt16(buffer, vtableOffset);
  const fieldOffsetOffset = 4 + fieldIndex * 2;
  if (fieldOffsetOffset >= vtableLength) return 0;

  const fieldOffset = readUInt16(buffer, vtableOffset + fieldOffsetOffset);
  return fieldOffset ? tableOffset + fieldOffset : 0;
}

function tableVector(buffer, tableOffset, fieldIndex) {
  const fieldOffset = tableField(buffer, tableOffset, fieldIndex);
  if (!fieldOffset) return [];

  const vectorOffset = fieldOffset + readUInt32(buffer, fieldOffset);
  const length = readUInt32(buffer, vectorOffset);
  const tables = [];

  for (let index = 0; index < length; index += 1) {
    const elementOffset = vectorOffset + 4 + index * 4;
    tables.push(elementOffset + readUInt32(buffer, elementOffset));
  }

  return tables;
}

function intVector(buffer, tableOffset, fieldIndex) {
  const fieldOffset = tableField(buffer, tableOffset, fieldIndex);
  if (!fieldOffset) return null;

  const vectorOffset = fieldOffset + readUInt32(buffer, fieldOffset);
  const length = readUInt32(buffer, vectorOffset);
  const valuesOffset = vectorOffset + 4;
  const values = [];

  for (let index = 0; index < length; index += 1) {
    values.push(readInt32(buffer, valuesOffset + index * 4));
  }

  return { values, valuesOffset };
}

function readUInt16(buffer, offset) {
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

function readInt32(buffer, offset) {
  return buffer.readInt32LE(offset);
}

async function run(command, commandArgs) {
  console.log(`$ ${command} ${commandArgs.join(" ")}`);
  const child = execFileCallback(command, commandArgs, {
    cwd: root,
    env: process.env,
  });

  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

function printUsage() {
  console.log(`Usage:
  node scripts/sync-recognizer-assets.mjs --copy-wasm
  node scripts/sync-recognizer-assets.mjs --upload-r2
  node scripts/sync-recognizer-assets.mjs --upload-r2 --bucket=kanji-recognizer-assets-staging

Options:
  --copy-wasm   Copy @tensorflow/tfjs-tflite WASM runtime into public/recognizer-wasm.
  --upload-r2   Download DaKanji v1.2 and upload model.tflite + labels.txt to remote R2.
  --bucket      R2 bucket name to upload into.

Environment:
  RECOGNIZER_R2_BUCKET  Defaults to ${defaultBucketName}.`);
}

function optionValue(name) {
  const inlineArg = rawArgs.find((arg) => arg.startsWith(`${name}=`));
  if (inlineArg) return inlineArg.slice(name.length + 1);

  const index = rawArgs.indexOf(name);
  if (index === -1) return null;

  return rawArgs[index + 1] || null;
}
