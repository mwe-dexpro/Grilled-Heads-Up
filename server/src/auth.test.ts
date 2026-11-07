import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp } from "./app.js";
import { normalizeRecoveryCode } from "./auth.js";
import { openDatabase } from "./database.js";
import { TestBrowser } from "./testing/testBrowser.js";
import { TestPasskey } from "./testing/testPasskey.js";

const recoveryCodeShape = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const servers: Server[] = [];
let db: DatabaseSync;
let baseUrl: string;

/** Starts the app on a free port with a database of its own, for the origins it is served from. */
async function startApp(origins = ["http://localhost:3000"]) {
  const database = openDatabase(":memory:");
  const server = createApp({ db: database, origins }).listen(0);
  servers.push(server);
  await new Promise((resolve) => server.once("listening", resolve));
  return { db: database, url: `http://localhost:${(server.address() as AddressInfo).port}` };
}

beforeEach(async () => {
  ({ db, url: baseUrl } = await startApp());
});

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

const sessionCookieOf = (response: Response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith("session="));
const ceremonyCookieOf = (response: Response) => response.headers.getSetCookie().find((cookie) => cookie.startsWith("passkey-ceremony="));
const attributesOf = (cookie: string | undefined) => (cookie ?? "").split("; ").slice(1);
const errorOf = async (response: Response) => ((await response.json()) as { error?: string }).error;

const browser = () => new TestBrowser(baseUrl);

/** The first launch: registers the owner's passkey and returns the recovery code shown once. */
async function becomeOwner(phone = browser(), passkey = new TestPasskey()) {
  const response = await phone.registerPasskey(passkey);
  expect(response.status).toBe(200);
  const { recoveryCode } = (await response.json()) as { recoveryCode: string };
  return { phone, passkey, recoveryCode };
}

describe("configuration", () => {
  test("the server will not start without an address to bind passkeys to", () => {
    expect(() => createApp({ db: openDatabase(":memory:"), origins: [] })).toThrow("origin");
  });
});

describe("registration", () => {
  test("on first launch, the first passkey creates the owner, signs in and gives a recovery code", async () => {
    const phone = browser();
    expect(await phone.session()).toEqual({ owner: false, signedIn: false });

    const { recoveryCode } = await becomeOwner(phone);

    expect(recoveryCode).toMatch(recoveryCodeShape);
    expect(await phone.session()).toEqual({ owner: true, signedIn: true });
    expect(await (await phone.get("/api/passkeys")).json()).toHaveLength(1);
  });

  test("nobody else can register once an owner exists", async () => {
    await becomeOwner();
    const stranger = browser();

    const response = await stranger.registerPasskey(new TestPasskey());

    expect(response.status).toBe(403);
    expect(await stranger.session()).toEqual({ owner: true, signedIn: false });
  });

  test("a registration started before the owner existed is refused when it finishes", async () => {
    const stranger = browser();
    const options = await stranger.registrationOptions();
    await becomeOwner();

    const response = await stranger.post("/api/auth/register/verify", new TestPasskey().register(options));

    expect(response.status).toBe(403);
    expect(await stranger.session()).toEqual({ owner: true, signedIn: false });
  });

  test("of two first launches finishing at once, only one becomes the owner", async () => {
    const [phone, laptop] = [browser(), browser()];
    const [phoneOptions, laptopOptions] = [await phone.registrationOptions(), await laptop.registrationOptions()];

    const responses = await Promise.all([
      phone.post("/api/auth/register/verify", new TestPasskey().register(phoneOptions)),
      laptop.post("/api/auth/register/verify", new TestPasskey().register(laptopOptions)),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 403]);
  });

  test("a passkey that doesn't check who holds it is refused", async () => {
    const phone = browser();
    const options = await phone.registrationOptions();

    const response = await phone.post("/api/auth/register/verify", new TestPasskey().register(options, { userVerified: false }));

    expect(response.status).toBe(400);
    expect(await phone.session()).toEqual({ owner: false, signedIn: false });
  });

  test("a signed-in owner adds a second passkey, without a new recovery code, and can sign in with it", async () => {
    const { phone, recoveryCode } = await becomeOwner();
    const laptopPasskey = new TestPasskey();

    const response = await phone.registerPasskey(laptopPasskey);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recoveryCode: null });
    // The owner is signed in already: adding a passkey starts no second session.
    expect(sessionCookieOf(response)).toBeUndefined();
    expect(db.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 1 });
    expect(await (await phone.get("/api/passkeys")).json()).toHaveLength(2);
    expect((await browser().post("/api/auth/recover", { code: recoveryCode })).status).toBe(200);
    expect((await browser().signIn(laptopPasskey)).status).toBe(204);
  });

  test("an answer to a challenge the server didn't give is refused", async () => {
    const response = await browser().post("/api/auth/register/verify", new TestPasskey().register({ challenge: "made-up", user: { id: "x" } }));

    expect(response.status).toBe(400);
  });
});

describe("sign-in", () => {
  test("the passkey signs in on another device", async () => {
    const { passkey } = await becomeOwner();
    const laptop = browser();

    expect((await laptop.signIn(passkey)).status).toBe(204);

    expect(await laptop.session()).toEqual({ owner: true, signedIn: true });
    expect((await laptop.get("/api/passkeys")).status).toBe(200);
  });

  test("a passkey the server doesn't know is refused", async () => {
    await becomeOwner();
    const stranger = browser();

    expect((await stranger.signIn(new TestPasskey())).status).toBe(401);
    expect(await stranger.session()).toEqual({ owner: true, signedIn: false });
  });

  test("a sign-in answer counts once", async () => {
    const { passkey } = await becomeOwner();
    const laptop = browser();
    const options = await laptop.signInOptions();
    const answer = passkey.signIn(options);
    expect((await laptop.post("/api/auth/sign-in/verify", answer)).status).toBe(204);
    await laptop.post("/api/auth/sign-out");

    expect((await laptop.post("/api/auth/sign-in/verify", answer)).status).toBe(401);
    expect(await laptop.session()).toEqual({ owner: true, signedIn: false });
  });

  test("an answer given on another site is refused", async () => {
    const { passkey } = await becomeOwner();
    const laptop = browser();
    const options = await laptop.signInOptions();

    const response = await laptop.post("/api/auth/sign-in/verify", passkey.signIn(options, { origin: "https://phishing.example" }));

    expect(response.status).toBe(401);
  });

  test("a sign-in without checking who holds the passkey is refused", async () => {
    const { passkey } = await becomeOwner();
    const laptop = browser();
    const options = await laptop.signInOptions();

    const response = await laptop.post("/api/auth/sign-in/verify", passkey.signIn(options, { userVerified: false }));

    expect(response.status).toBe(401);
  });

  test("only so many sign-ins wait at once; the oldest gives way", async () => {
    const { passkey } = await becomeOwner();
    const first = browser();
    const options = await first.signInOptions();
    for (let i = 0; i < 100; i++) await browser().signInOptions();

    expect((await first.post("/api/auth/sign-in/verify", passkey.signIn(options))).status).toBe(401);
    expect((await browser().signIn(passkey)).status).toBe(204);
  });

  test("signing out ends the session", async () => {
    const { phone } = await becomeOwner();

    expect((await phone.post("/api/auth/sign-out")).status).toBe(204);

    expect(await phone.session()).toEqual({ owner: true, signedIn: false });
    expect((await phone.get("/api/passkeys")).status).toBe(401);
  });
});

describe("recovery", () => {
  test("the recovery code signs in and lets you register a new passkey", async () => {
    const { recoveryCode } = await becomeOwner();
    const newPhone = browser();

    const response = await newPhone.post("/api/auth/recover", { code: recoveryCode });

    expect(response.status).toBe(200);
    expect(await newPhone.session()).toEqual({ owner: true, signedIn: true });
    const newPasskey = new TestPasskey();
    expect((await newPhone.registerPasskey(newPasskey)).status).toBe(200);
    expect((await browser().signIn(newPasskey)).status).toBe(204);
  });

  test("a used recovery code is spent, and the new one shown instead works", async () => {
    const { recoveryCode } = await becomeOwner();
    const recovered = await browser().post("/api/auth/recover", { code: recoveryCode });
    const { recoveryCode: newCode } = (await recovered.json()) as { recoveryCode: string };

    expect(newCode).toMatch(recoveryCodeShape);
    expect(newCode).not.toBe(recoveryCode);
    expect((await browser().post("/api/auth/recover", { code: recoveryCode })).status).toBe(401);
    expect((await browser().post("/api/auth/recover", { code: newCode })).status).toBe(200);
  });

  test("the code may be typed in lower case, without dashes", async () => {
    const { recoveryCode } = await becomeOwner();

    const response = await browser().post("/api/auth/recover", { code: recoveryCode.toLowerCase().replaceAll("-", " ") });

    expect(response.status).toBe(200);
  });

  test("a wrong code is refused", async () => {
    await becomeOwner();
    const stranger = browser();

    expect((await stranger.post("/api/auth/recover", { code: "0000-0000-0000-0000-0000" })).status).toBe(401);
    expect((await stranger.post("/api/auth/recover", {})).status).toBe(401);
    expect(await stranger.session()).toEqual({ owner: true, signedIn: false });
  });

  test("a signed-in owner can get a new code, which replaces the old one", async () => {
    const { phone, recoveryCode } = await becomeOwner();

    const response = await phone.post("/api/auth/recovery-code");

    expect(response.status).toBe(200);
    const { recoveryCode: newCode } = (await response.json()) as { recoveryCode: string };
    expect(newCode).toMatch(recoveryCodeShape);
    expect((await browser().post("/api/auth/recover", { code: recoveryCode })).status).toBe(401);
    expect((await browser().post("/api/auth/recover", { code: newCode })).status).toBe(200);
  });

  test("nobody signed out gets a new code", async () => {
    await becomeOwner();

    expect((await browser().post("/api/auth/recovery-code")).status).toBe(401);
  });

  test("before an owner exists, no code signs in", async () => {
    expect((await browser().post("/api/auth/recover", { code: "" })).status).toBe(401);
  });

  test("letters mistaken for digits read as the digits", () => {
    expect(normalizeRecoveryCode("o1il-ab2c")).toBe(normalizeRecoveryCode("0111AB2C"));
  });
});

describe("cookies and what is stored", () => {
  const day = 24 * 60 * 60 * 1000;

  test("the session cookie is HttpOnly, for the whole site, SameSite=Lax, and lasts 180 days; on a plain http address it is not Secure", async () => {
    const before = Date.now();

    const response = await browser().registerPasskey(new TestPasskey());

    const attributes = attributesOf(sessionCookieOf(response));
    expect(attributes).toEqual(expect.arrayContaining(["Path=/", "HttpOnly", "SameSite=Lax"]));
    expect(attributes).not.toContain("Secure");
    const expires = Date.parse(attributes.find((attribute) => attribute.startsWith("Expires="))?.slice("Expires=".length) ?? "");
    // The Expires header has a resolution of a second.
    expect(expires - before).toBeGreaterThan(180 * day - 60_000);
    expect(expires - before).toBeLessThan(180 * day + 60_000);
  });

  test("on an https address the session cookie and the cookie of a waiting sign-in are Secure, and the latter lasts five minutes, for the sign-in routes only", async () => {
    const app = await startApp(["https://heads-up.example"]);
    const phone = new TestBrowser(app.url);

    const options = await phone.post("/api/auth/register/options");
    const registered = await phone.post(
      "/api/auth/register/verify",
      new TestPasskey("https://heads-up.example", "heads-up.example").register((await options.json()) as { challenge: string; user: { id: string } }),
    );

    expect(registered.status).toBe(200);
    expect(attributesOf(ceremonyCookieOf(options))).toEqual(expect.arrayContaining(["Max-Age=300", "Path=/api/auth", "HttpOnly", "Secure", "SameSite=Strict"]));
    expect(attributesOf(sessionCookieOf(registered))).toEqual(expect.arrayContaining(["Path=/", "HttpOnly", "Secure", "SameSite=Lax"]));
  });

  test("the cookie of a waiting sign-in is cleared as soon as it is used", async () => {
    const phone = browser();
    const options = await phone.post("/api/auth/register/options");

    const verified = await phone.post(
      "/api/auth/register/verify",
      new TestPasskey().register((await options.json()) as { challenge: string; user: { id: string } }),
    );

    const cleared = ceremonyCookieOf(verified);
    expect(cleared).toMatch(/^passkey-ceremony=;/);
    expect(attributesOf(cleared)).toContain("Path=/api/auth");
  });

  test("a session lasts 180 days, and no longer", async () => {
    const { phone } = await becomeOwner();
    const start = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });

    vi.setSystemTime(start + 180 * day - 60_000);
    expect((await phone.get("/api/passkeys")).status).toBe(200);
    vi.setSystemTime(start + 180 * day + 60_000);
    expect((await phone.get("/api/passkeys")).status).toBe(401);
  });

  test("a sign-in answer is good for five minutes after the options, to the millisecond", async () => {
    const { passkey } = await becomeOwner();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now());
    const asked = Date.now();
    const [inTime, late] = [browser(), browser()];
    const [inTimeOptions, lateOptions] = [await inTime.signInOptions(), await late.signInOptions()];

    vi.setSystemTime(asked + 5 * 60 * 1000);
    expect((await inTime.post("/api/auth/sign-in/verify", passkey.signIn(inTimeOptions))).status).toBe(204);
    vi.setSystemTime(asked + 5 * 60 * 1000 + 1);
    expect((await late.post("/api/auth/sign-in/verify", passkey.signIn(lateOptions))).status).toBe(401);
  });

  test("a challenge is answered once: a failed answer uses it up", async () => {
    const { passkey } = await becomeOwner();
    const laptop = browser();
    const options = await laptop.signInOptions();
    const waiting = laptop.cookieHeader();

    expect((await laptop.post("/api/auth/sign-in/verify", passkey.signIn(options, { userVerified: false }))).status).toBe(401);

    // The same cookie again, as an attacker who kept it would send it.
    const again = await fetch(`${baseUrl}/api/auth/sign-in/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: waiting },
      body: JSON.stringify(passkey.signIn(options)),
    });
    expect(again.status).toBe(401);
    expect(await laptop.session()).toEqual({ owner: true, signedIn: false });
  });

  test("signing out ends the session on the server, so a copy of the cookie stops working too", async () => {
    const { phone } = await becomeOwner();
    const copy = phone.cookieHeader();

    const response = await phone.post("/api/auth/sign-out");

    expect(attributesOf(sessionCookieOf(response))).toContain("Path=/");
    expect((await fetch(`${baseUrl}/api/passkeys`, { headers: { cookie: copy } })).status).toBe(401);
    expect(db.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toEqual({ n: 0 });
  });

  test("signing out without a session is no error", async () => {
    await becomeOwner();

    const response = await fetch(`${baseUrl}/api/auth/sign-out`, { method: "POST" });

    expect(response.status).toBe(204);
  });

  test("only hashes of the session token and the recovery code are stored", async () => {
    const { phone, recoveryCode } = await becomeOwner();
    const token = phone.cookieHeader().replace("session=", "");

    const session = db.prepare("SELECT token_hash FROM sessions").get() as { token_hash: string };
    const owner = db.prepare("SELECT recovery_code_hash FROM users").get() as { recovery_code_hash: string };

    expect(session.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(session.token_hash).not.toBe(token);
    expect(owner.recovery_code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(owner.recovery_code_hash).not.toContain(recoveryCode.replaceAll("-", ""));
  });
});

describe("what the server asks the browser for", () => {
  test("a registration asks for a discoverable passkey that checks who holds it, with no attestation, for this site", async () => {
    const options = (await (await browser().post("/api/auth/register/options")).json()) as { user: { id: string }; excludeCredentials: unknown[] };

    expect(options).toMatchObject({
      rp: { name: "Grilled Heads-Up", id: "localhost" },
      user: { name: "Grilled Heads-Up", displayName: "Grilled Heads-Up" },
      attestation: "none",
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      excludeCredentials: [],
    });
    // The user handle is 16 random bytes.
    expect(Buffer.from(options.user.id, "base64url")).toHaveLength(16);
  });

  test("a passkey added by the signed-in owner is for the owner, and leaves out the passkeys the device has", async () => {
    const { phone, passkey } = await becomeOwner();
    const owner = db.prepare("SELECT id FROM users").get() as { id: string };

    const options = (await (await phone.post("/api/auth/register/options")).json()) as { user: { id: string } };

    expect(options).toMatchObject({ user: { id: owner.id }, excludeCredentials: [{ id: passkey.id, transports: ["internal"] }] });
  });

  test("a passkey that names no transports is kept without any, and is left out of a new registration just the same", async () => {
    const { phone } = await becomeOwner();
    const bare = new TestPasskey();
    const options = await phone.registrationOptions();
    expect((await phone.post("/api/auth/register/verify", bare.register(options, { transports: null }))).status).toBe(200);

    const next = (await (await phone.post("/api/auth/register/options")).json()) as { excludeCredentials: { id: string; transports?: string[] }[] };

    expect(next.excludeCredentials.find((credential) => credential.id === bare.id)?.transports ?? []).toEqual([]);
    expect(db.prepare("SELECT transports FROM passkeys WHERE id = ?").get(bare.id)).toEqual({ transports: "[]" });
  });

  test("a sign-in asks for user verification, for this site", async () => {
    const options = await (await browser().post("/api/auth/sign-in/options")).json();

    expect(options).toMatchObject({ rpId: "localhost", userVerification: "required" });
  });
});

describe("answers the server refuses, and what it says", () => {
  test("registration: the owner rule, a missing challenge and a passkey that is not verified", async () => {
    await becomeOwner();
    const stranger = browser();
    const refused = await stranger.registerPasskey(new TestPasskey());
    expect([refused.status, await errorOf(refused)]).toEqual([403, "An owner exists. Sign in to add a passkey."]);

    const noCeremony = await browser().post("/api/auth/register/verify", new TestPasskey().register({ challenge: "made-up", user: { id: "x" } }));
    expect([noCeremony.status, await errorOf(noCeremony)]).toEqual([400, "No passkey registration is under way."]);
  });

  test("registration: a passkey that checks nobody, and an owner who appeared meanwhile", async () => {
    const phone = browser();
    const options = await phone.registrationOptions();
    const unverified = await phone.post("/api/auth/register/verify", new TestPasskey().register(options, { userVerified: false }));
    expect([unverified.status, await errorOf(unverified)]).toEqual([400, "The passkey couldn't be verified."]);

    const late = browser();
    const lateOptions = await late.registrationOptions();
    await becomeOwner();
    const tooLate = await late.post("/api/auth/register/verify", new TestPasskey().register(lateOptions));
    expect([tooLate.status, await errorOf(tooLate)]).toEqual([403, "An owner exists. Sign in to add a passkey."]);
  });

  test("registration: nobody but the signed-in owner gets options once there is an owner", async () => {
    await becomeOwner();

    const response = await browser().post("/api/auth/register/options");

    expect([response.status, await errorOf(response)]).toEqual([403, "An owner exists. Sign in to add a passkey."]);
  });

  test("a passkey registration the owner started cannot be finished after the session has ended", async () => {
    const { phone } = await becomeOwner();
    const options = await phone.registrationOptions();
    const copy = phone.cookieHeader();
    await phone.post("/api/auth/sign-out");

    const response = await fetch(`${baseUrl}/api/auth/register/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: copy },
      body: JSON.stringify(new TestPasskey().register(options)),
    });

    // The session is gone: nobody signed in adds a passkey.
    expect([response.status, await errorOf(response)]).toEqual([403, "An owner exists. Sign in to add a passkey."]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM passkeys").get()).toEqual({ n: 1 });
  });

  test("sign-in: an unknown passkey, an answer without a passkey and a wrong site all say the same", async () => {
    const { passkey } = await becomeOwner();
    const stranger = browser();
    const unknown = await stranger.signIn(new TestPasskey());
    expect([unknown.status, await errorOf(unknown)]).toEqual([401, "Sign-in didn't work."]);

    const laptop = browser();
    const options = await laptop.signInOptions();
    const phishing = await laptop.post("/api/auth/sign-in/verify", passkey.signIn(options, { origin: "https://phishing.example" }));
    expect([phishing.status, await errorOf(phishing)]).toEqual([401, "Sign-in didn't work."]);

    const unverified = await browser().post("/api/auth/sign-in/verify", passkey.signIn(await browser().signInOptions(), { userVerified: false }));
    expect(unverified.status).toBe(401);
  });

  test("a verify request without a usable body is refused, not crashed on", async () => {
    await becomeOwner();
    const stranger = browser();
    await stranger.signInOptions();

    for (const body of [undefined, {}, { id: 5 }, { id: "no-such-passkey" }]) {
      const response = await stranger.post("/api/auth/sign-in/verify", body);
      expect([response.status, await errorOf(response)], JSON.stringify(body)).toEqual([401, "Sign-in didn't work."]);
    }
    const text = await fetch(`${baseUrl}/api/auth/sign-in/verify`, { method: "POST", headers: { "content-type": "text/plain" }, body: "id=1" });
    expect(text.status).toBe(401);
    const recover = await fetch(`${baseUrl}/api/auth/recover`, { method: "POST", headers: { "content-type": "text/plain" }, body: "code=1" });
    expect([recover.status, await errorOf(recover)]).toEqual([401, "That recovery code doesn't match."]);
    expect((await stranger.post("/api/auth/recover")).status).toBe(401);
  });

  test("recovery: a wrong code and nobody signed in say so", async () => {
    await becomeOwner();
    const stranger = browser();

    const wrong = await stranger.post("/api/auth/recover", { code: "0000-0000-0000-0000-0000" });
    expect([wrong.status, await errorOf(wrong)]).toEqual([401, "That recovery code doesn't match."]);
    const newCode = await stranger.post("/api/auth/recovery-code");
    expect([newCode.status, await errorOf(newCode)]).toEqual([401, "Sign in first."]);
  });

  test("a request with no cookie at all is not signed in", async () => {
    await becomeOwner();

    const response = await fetch(`${baseUrl}/api/passkeys`);

    expect([response.status, await errorOf(response)]).toEqual([401, "Sign in first."]);
    expect(await (await fetch(`${baseUrl}/api/auth/session`)).json()).toEqual({ owner: true, signedIn: false });
  });

  test("the session is found among other cookies, and a cookie value is decoded", async () => {
    const { phone } = await becomeOwner();
    const token = phone.cookieHeader().replace("session=", "");

    const response = await fetch(`${baseUrl}/api/passkeys`, { headers: { cookie: `theme=dark; session=${encodeURIComponent(token)}; other=1` } });

    expect(response.status).toBe(200);
  });
});

describe("data routes", () => {
  test("reject requests that aren't signed in", async () => {
    await becomeOwner();
    const stranger = browser();

    expect((await stranger.get("/api/passkeys")).status).toBe(401);
    // Routes added later are covered too: everything under /api except health and sign-in.
    expect((await stranger.get("/api/tasks")).status).toBe(401);
    expect((await stranger.post("/api/tasks", { title: "Sneaky" })).status).toBe(401);
  });

  test("reject a session cookie that is empty or names no session", async () => {
    await becomeOwner();

    for (const cookie of ["session=", "session=made-up", "other=1"]) {
      const response = await fetch(`${baseUrl}/api/passkeys`, { headers: { cookie } });
      expect(response.status, cookie).toBe(401);
    }
  });

  test("answer a signed-in owner", async () => {
    const { phone } = await becomeOwner();

    expect((await phone.get("/api/passkeys")).status).toBe(200);
    expect((await phone.get("/api/tasks")).status).toBe(404);
  });

  test("health needs no sign-in", async () => {
    expect(await (await browser().get("/api/health")).json()).toEqual({ status: "ok", database: "ready" });
  });
});
