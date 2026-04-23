import { createApp } from "honox/server";
import { showRoutes } from "hono/dev";
import type { AppEnv } from "./env";
import { APP_VERSION, DATA_VERSION } from "../src/version.js";

const ALLOWED_ORIGINS = new Set([
  "https://kanji-stroke-order.pages.dev",
  "https://kanji-stroke-order.workers.dev",
  "https://kokugo.app",
  "https://www.kokugo.app",
  "http://localhost:8000",
  "http://localhost:3000",
]);

const SHEET_ROUTE_PREFIX = "/api/sheet/";

function corsOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) return origin;
  return null;
}

function withCors(origin: string | null, headers: HeadersInit = {}) {
  const responseHeaders = new Headers(headers);

  if (origin) {
    responseHeaders.set("Access-Control-Allow-Origin", origin);
    responseHeaders.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, X-Upload-Key, X-Read-Key");
  }

  return responseHeaders;
}

function keyFromPath(pathname: string) {
  if (!pathname.startsWith(SHEET_ROUTE_PREFIX)) return null;
  return decodeURIComponent(pathname.slice(SHEET_ROUTE_PREFIX.length));
}

function jsonLog(level: "info" | "error", message: string, details: Record<string, unknown>) {
  const payload = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    message,
    ...details,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  console.log(payload);
}

const app = createApp<AppEnv>();

app.use("*", async (c, next) => {
  const startedAt = Date.now();
  await next();

  c.header("X-App-Version", APP_VERSION);
  c.header("X-Data-Version", DATA_VERSION);

  jsonLog("info", "request.complete", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
});

app.onError((error, c) => {
  jsonLog("error", "request.failed", {
    method: c.req.method,
    path: c.req.path,
    error: error instanceof Error ? error.message : String(error),
  });

  return c.text("Internal Server Error", 500);
});

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "kanji-stroke-order",
    runtime: "cloudflare-workers",
    appVersion: APP_VERSION,
    dataVersion: DATA_VERSION,
    hasSheetsBinding: Boolean(c.env?.SHEETS),
    host: new URL(c.req.url).host,
  });
});

app.options("/api/sheet/*", (c) => {
  const origin = corsOrigin(c.req.raw);
  return new Response(null, {
    status: 204,
    headers: withCors(origin),
  });
});

app.get("/api/sheet/*", async (c) => {
  const origin = corsOrigin(c.req.raw);
  const key = keyFromPath(new URL(c.req.url).pathname);

  if (!key) {
    return new Response("Not Found", { status: 404, headers: withCors(origin) });
  }

  if (c.env.READ_KEY && c.req.header("X-Read-Key") !== c.env.READ_KEY) {
    return new Response("Unauthorized", { status: 401, headers: withCors(origin) });
  }

  const object = await c.env.SHEETS.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404, headers: withCors(origin) });
  }

  return new Response(object.body, {
    headers: withCors(origin, {
      "Content-Type": "application/pdf",
      "Cache-Control": "public, max-age=31536000, immutable",
    }),
  });
});

app.put("/api/sheet/*", async (c) => {
  const origin = corsOrigin(c.req.raw);
  const key = keyFromPath(new URL(c.req.url).pathname);

  if (!key) {
    return new Response("Not Found", { status: 404, headers: withCors(origin) });
  }

  if (c.env.UPLOAD_KEY && c.req.header("X-Upload-Key") !== c.env.UPLOAD_KEY) {
    return new Response("Unauthorized", { status: 401, headers: withCors(origin) });
  }

  const contentType = c.req.header("Content-Type") || "";
  if (!contentType.includes("application/pdf")) {
    return new Response("Content-Type must be application/pdf", {
      status: 400,
      headers: withCors(origin),
    });
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength > 2 * 1024 * 1024) {
    return new Response("Payload too large (2MB max)", {
      status: 413,
      headers: withCors(origin),
    });
  }

  await c.env.SHEETS.put(key, body, {
    httpMetadata: { contentType: "application/pdf" },
  });

  return new Response(JSON.stringify({ ok: true, key }), {
    status: 201,
    headers: withCors(origin, {
      "Content-Type": "application/json",
    }),
  });
});

if (import.meta.env.DEV) {
  showRoutes(app);
}

export default app;
