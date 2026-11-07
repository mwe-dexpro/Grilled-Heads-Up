import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";
import { TestBrowser } from "./testing/testBrowser.js";
import { TestPasskey } from "./testing/testPasskey.js";

const indexHtml = '<!doctype html><div id="root"></div>';
let clientDir: string;
const servers: Server[] = [];

beforeAll(() => {
  clientDir = mkdtempSync(join(tmpdir(), "heads-up-client-"));
  mkdirSync(join(clientDir, "assets"));
  writeFileSync(join(clientDir, "index.html"), indexHtml);
  writeFileSync(join(clientDir, "sw.js"), "// service worker");
  writeFileSync(join(clientDir, "assets", "app-1a2b3c.js"), "// hashed build asset");
});
afterAll(() => rmSync(clientDir, { recursive: true, force: true }));
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function start(options: { clientDir?: string } = {}) {
  const server = createApp({ db: openDatabase(":memory:"), origins: ["http://localhost:3000"], ...options }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

describe("health", () => {
  test("says the app and its database are up, without a sign-in", async () => {
    const response = await fetch(`${await start()}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ready" });
  });
});

describe("API routes", () => {
  test("an API route that does not exist says so in JSON to a signed-in owner, and asks a stranger to sign in", async () => {
    const url = await start();
    const phone = new TestBrowser(url);
    expect((await phone.registerPasskey(new TestPasskey())).status).toBe(200);

    const known = await phone.get("/api/nothing-here");
    expect([known.status, await known.json()]).toEqual([404, { error: "Not found." }]);
    const stranger = await fetch(`${url}/api/nothing-here`);
    expect([stranger.status, await stranger.json()]).toEqual([401, { error: "Sign in first." }]);
  });

  test("lists the owner's passkeys, with when each was made and last used, to the signed-in owner only", async () => {
    const url = await start();
    const phone = new TestBrowser(url);
    const passkey = new TestPasskey();
    await phone.registerPasskey(passkey);
    await new TestBrowser(url).signIn(passkey);

    const passkeys = (await (await phone.get("/api/passkeys")).json()) as { createdAt: string; lastUsedAt: string | null }[];

    expect(passkeys).toHaveLength(1);
    expect(Date.parse(passkeys[0]?.createdAt ?? "")).not.toBeNaN();
    expect(Date.parse(passkeys[0]?.lastUsedAt ?? "")).not.toBeNaN();
    expect((await fetch(`${url}/api/passkeys`)).status).toBe(401);
  });
});

describe("the built app", () => {
  test("is served without a sign-in, and must be revalidated by the browser", async () => {
    const url = await start({ clientDir });

    const response = await fetch(`${url}/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(indexHtml);
    expect(response.headers.get("cache-control")).toBe("no-cache");
  });

  test("serves hashed build assets for a year, and the service worker and other files for revalidation", async () => {
    const url = await start({ clientDir });

    const asset = await fetch(`${url}/assets/app-1a2b3c.js`);
    const worker = await fetch(`${url}/sw.js`);

    expect(await asset.text()).toBe("// hashed build asset");
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await worker.text()).toBe("// service worker");
    expect(worker.headers.get("cache-control")).toBe("no-cache");
  });

  test("answers the address of a screen of the app with the app, to be revalidated", async () => {
    const url = await start({ clientDir });

    for (const path of ["/task/abc", "/event/new/edit", "/anything/else"]) {
      const response = await fetch(`${url}${path}`);
      expect([path, response.status, await response.text()]).toEqual([path, 200, indexHtml]);
      expect(response.headers.get("cache-control")).toBe("no-cache");
    }
  });

  test("never answers an API address with the app", async () => {
    const url = await start({ clientDir });

    const response = await fetch(`${url}/api/unknown`);

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("root");
  });

  test("is not served when there is no built app (the tests, development)", async () => {
    const url = await start();

    expect((await fetch(`${url}/`)).status).toBe(404);
    expect((await fetch(`${url}/task/abc`)).status).toBe(404);
  });
});
