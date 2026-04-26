import { createApp } from "honox/server";
import { cache } from "hono/cache";
import { showRoutes } from "hono/dev";
import type { Context, Next } from "hono";
import type { AppEnv } from "./env";
import { APP_VERSION, DATA_VERSION } from "../src/version.js";

const ALLOWED_ORIGINS = new Set([
  "https://kanji-stroke-order.pages.dev",
  "https://kanji-stroke-order.workers.dev",
  "https://staging.kokugo.app",
  "https://kokugo.app",
  "https://www.kokugo.app",
  "http://localhost:8000",
  "http://localhost:3000",
]);

const SHEET_ROUTE_PREFIX = "/api/sheet/";
const RECOGNIZER_ASSET_ROUTE_PREFIX = "/api/recognizer-assets/";
const HTML_CACHE_TTL = 300;
const RECOGNIZER_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const RECOGNIZER_ASSET_PREFIX = "dakanji/v1.2-browser64";
const RECOGNIZER_ASSET_KEYS = new Map([
  ["labels.txt", { contentType: "text/plain; charset=utf-8", key: `${RECOGNIZER_ASSET_PREFIX}/labels.txt` }],
  ["model.tflite", { contentType: "application/octet-stream", key: `${RECOGNIZER_ASSET_PREFIX}/model.tflite` }],
]);
const NOINDEX_HEADER = "noindex, nofollow, noarchive";
const STAGING_AUTH_EXEMPT_PATHS = new Set(["/api/health", "/robots.txt"]);

function isStagingHost(hostname: string) {
  return hostname === "staging.kokugo.app" || hostname.startsWith("kanji-stroke-order-staging.");
}

function hostnameFromRequest(request: Request) {
  const urlHostname = new URL(request.url).hostname;
  const hostHeader = request.headers.get("Host")?.split(":")[0];

  if ((urlHostname === "localhost" || urlHostname === "127.0.0.1") && hostHeader) {
    return hostHeader;
  }

  return urlHostname;
}

function isLabPath(pathname: string) {
  return pathname === "/lab" || pathname.startsWith("/lab/");
}

function shouldNoindex(request: Request) {
  const url = new URL(request.url);
  return isStagingHost(hostnameFromRequest(request)) || isLabPath(url.pathname);
}

function isStagingAuthExempt(pathname: string) {
  return STAGING_AUTH_EXEMPT_PATHS.has(pathname);
}

function isAuthorizedForStaging(request: Request, expectedAuth: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Basic ")) return false;

  try {
    return atob(authorization.slice("Basic ".length)) === expectedAuth;
  } catch {
    return false;
  }
}

function stagingAuthResponse(status = 401) {
  return new Response(status === 503 ? "Staging authentication is not configured" : "Authentication required", {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Basic realm="kokugo staging", charset="UTF-8"',
      "X-Robots-Tag": NOINDEX_HEADER,
    },
  });
}

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

function recognizerAssetFromPath(pathname: string) {
  if (!pathname.startsWith(RECOGNIZER_ASSET_ROUTE_PREFIX)) return null;

  try {
    const requestedFile = decodeURIComponent(pathname.slice(RECOGNIZER_ASSET_ROUTE_PREFIX.length));
    return RECOGNIZER_ASSET_KEYS.get(requestedFile) || null;
  } catch {
    return null;
  }
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

const publicPageCache = cache({
  cacheName: `kokugo-html-${APP_VERSION}-${DATA_VERSION}`,
  cacheControl: `public, max-age=${HTML_CACHE_TTL}`,
  cacheableStatusCodes: [200, 404],
  keyGenerator: (c) => c.req.url,
  onCacheNotAvailable: false,
});

async function appShellMiddleware(c: Context<AppEnv>, next: Next) {
  const startedAt = Date.now();
  const requestUrl = new URL(c.req.url);
  const requestHostname = hostnameFromRequest(c.req.raw);
  const markNoindex = isStagingHost(requestHostname) || isLabPath(requestUrl.pathname);

  if (isStagingHost(requestHostname) && !isStagingAuthExempt(requestUrl.pathname)) {
    if (!c.env?.STAGING_BASIC_AUTH) {
      return stagingAuthResponse(503);
    }

    if (!isAuthorizedForStaging(c.req.raw, c.env.STAGING_BASIC_AUTH)) {
      return stagingAuthResponse();
    }
  }

  if (markNoindex) {
    c.header("X-Robots-Tag", NOINDEX_HEADER);
  }

  await next();

  c.header("X-App-Version", APP_VERSION);
  c.header("X-Data-Version", DATA_VERSION);
  if (markNoindex || shouldNoindex(c.req.raw)) {
    c.res.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  }

  jsonLog("info", "request.complete", {
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs: Date.now() - startedAt,
  });
}

const app = createApp<AppEnv>({
  init: (app) => {
    app.use("*", appShellMiddleware);
  },
});

app.use("/", publicPageCache);
app.use("/grade/*", publicPageCache);
app.use("/about", publicPageCache);
app.use("/privacy", publicPageCache);
app.use("/terms", publicPageCache);

app.onError((error, c) => {
  jsonLog("error", "request.failed", {
    method: c.req.method,
    path: c.req.path,
    error: error instanceof Error ? error.message : String(error),
  });

  return c.text("Internal Server Error", 500);
});

app.get("/robots.txt", (c) => {
  const hostname = hostnameFromRequest(c.req.raw);
  const disallow = isStagingHost(hostname) ? "/" : "/lab/";

  return new Response(`User-agent: *\nDisallow: ${disallow}\n`, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": isStagingHost(hostname) ? NOINDEX_HEADER : "noindex",
    },
  });
});

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    service: "kanji-stroke-order",
    runtime: "cloudflare-workers",
    appVersion: APP_VERSION,
    dataVersion: DATA_VERSION,
    hasRecognizerAssetsBinding: Boolean(c.env?.RECOGNIZER_ASSETS),
    hasSheetsBinding: Boolean(c.env?.SHEETS),
    host: new URL(c.req.url).host,
  });
});

app.options("/api/recognizer-assets/*", (c) => {
  const origin = corsOrigin(c.req.raw);
  return new Response(null, {
    status: 204,
    headers: withCors(origin),
  });
});

app.get("/api/recognizer-assets/*", async (c) => {
  const origin = corsOrigin(c.req.raw);
  const asset = recognizerAssetFromPath(new URL(c.req.url).pathname);

  if (!asset) {
    return new Response("Not Found", { status: 404, headers: withCors(origin) });
  }

  if (!c.env?.RECOGNIZER_ASSETS) {
    return new Response("Recognizer assets are not configured", {
      status: 503,
      headers: withCors(origin, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex",
      }),
    });
  }

  const object = await c.env.RECOGNIZER_ASSETS.get(asset.key);
  if (!object) {
    return new Response("Not Found", {
      status: 404,
      headers: withCors(origin, {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex",
      }),
    });
  }

  const headers = withCors(origin, {
    "Cache-Control": RECOGNIZER_ASSET_CACHE_CONTROL,
    "Content-Type": asset.contentType,
    "ETag": object.httpEtag,
    "X-Robots-Tag": "noindex",
  });

  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", RECOGNIZER_ASSET_CACHE_CONTROL);
  headers.set("Content-Type", asset.contentType);
  headers.set("X-Robots-Tag", "noindex");

  return new Response(object.body, { headers });
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

  if (!c.env.READ_KEY || c.req.header("X-Read-Key") !== c.env.READ_KEY) {
    return new Response("Unauthorized", { status: 401, headers: withCors(origin) });
  }

  const object = await c.env.SHEETS.get(key);
  if (!object) {
    return new Response("Not Found", { status: 404, headers: withCors(origin) });
  }

  return new Response(object.body, {
    headers: withCors(origin, {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
    }),
  });
});

app.put("/api/sheet/*", async (c) => {
  const origin = corsOrigin(c.req.raw);
  const key = keyFromPath(new URL(c.req.url).pathname);

  if (!key) {
    return new Response("Not Found", { status: 404, headers: withCors(origin) });
  }

  if (!c.env.UPLOAD_KEY || c.req.header("X-Upload-Key") !== c.env.UPLOAD_KEY) {
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
