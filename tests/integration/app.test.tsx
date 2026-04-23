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
});
