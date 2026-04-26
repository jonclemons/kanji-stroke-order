import { describe, expect, it } from "vitest";
import app from "../../app/server";
import { APP_VERSION, DATA_VERSION } from "../../src/version.js";

describe("Honox app shell", () => {
  it("renders the kanji practice shell from the root route", async () => {
    const response = await app.request("/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(html).toContain("かんじれんしゅう");
    expect(html).toContain('id="kanjiInput"');
    expect(html).toContain("/manifest.json");
  });

  it("exposes a worker health endpoint with version info", async () => {
    const response = await app.request("/api/health");
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      service: "kanji-stroke-order",
      runtime: "cloudflare-workers",
      appVersion: APP_VERSION,
      dataVersion: DATA_VERSION,
    });
    expect(response.headers.get("x-app-version")).toBe(APP_VERSION);
    expect(response.headers.get("x-data-version")).toBe(DATA_VERSION);
  });

  it("renders the hidden draw lab without linking it from the public root", async () => {
    const [rootResponse, labResponse] = await Promise.all([
      app.request("/"),
      app.request("/lab/draw"),
    ]);
    const rootHtml = await rootResponse.text();
    const labHtml = await labResponse.text();

    expect(labResponse.status).toBe(200);
    expect(labHtml).toContain("てがきラボ");
    expect(labHtml).toContain("てがきでさがす");
    expect(labHtml).toContain("かけたかチェック");
    expect(rootHtml).not.toContain("/lab/draw");
  });

  it("reports missing recognizer assets when the R2 binding is not configured", async () => {
    const response = await app.request("/api/recognizer-assets/model.tflite");

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Recognizer assets are not configured");
  });

  it("marks the hidden lab as noindex", async () => {
    const response = await app.request("/lab/draw");

    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("blocks staging hosts without basic auth", async () => {
    const response = await app.request("/lab/draw", {
      headers: { Host: "staging.kokugo.app" },
    });

    expect(response.status).toBe(503);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("challenges staging hosts when basic auth is configured", async () => {
    const response = await app.request(
      "/lab/draw",
      { headers: { Host: "staging.kokugo.app" } },
      { STAGING_BASIC_AUTH: "kokugo:test" },
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("allows staging hosts with matching basic auth", async () => {
    const response = await app.request(
      "/lab/draw",
      {
        headers: {
          Authorization: `Basic ${btoa("kokugo:test")}`,
          Host: "staging.kokugo.app",
        },
      },
      { STAGING_BASIC_AUTH: "kokugo:test" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("serves staging robots.txt as disallow all", async () => {
    const response = await app.request("/robots.txt", {
      headers: { Host: "staging.kokugo.app" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await response.text()).toBe("User-agent: *\nDisallow: /\n");
  });
});
