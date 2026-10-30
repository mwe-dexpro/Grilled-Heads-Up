import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp } from "./app.js";
import { normalizeRecoveryCode } from "./auth.js";
import { openDatabase } from "./database.js";
import { TestBrowser } from "./testing/testBrowser.js";
import { TestPasskey } from "./testing/testPasskey.js";

const recoveryCodeShape = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/;

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  const db = openDatabase(":memory:");
  server = createApp({ db, origins: ["http://localhost:3000"] }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(() => new Promise((resolve) => server.close(resolve)));

const browser = () => new TestBrowser(baseUrl);

/** The first launch: registers the owner's passkey and returns the recovery code shown once. */
async function becomeOwner(phone = browser(), passkey = new TestPasskey()) {
  const response = await phone.registerPasskey(passkey);
  expect(response.status).toBe(200);
  const { recoveryCode } = (await response.json()) as { recoveryCode: string };
  return { phone, passkey, recoveryCode };
}

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

  test("a signed-in owner adds a second passkey, without a new recovery code, and can sign in with it", async () => {
    const { phone, recoveryCode } = await becomeOwner();
    const laptopPasskey = new TestPasskey();

    const response = await phone.registerPasskey(laptopPasskey);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ recoveryCode: null });
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

  test("before an owner exists, no code signs in", async () => {
    expect((await browser().post("/api/auth/recover", { code: "" })).status).toBe(401);
  });

  test("letters mistaken for digits read as the digits", () => {
    expect(normalizeRecoveryCode("o1il-ab2c")).toBe(normalizeRecoveryCode("0111AB2C"));
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

  test("answer a signed-in owner", async () => {
    const { phone } = await becomeOwner();

    expect((await phone.get("/api/passkeys")).status).toBe(200);
    expect((await phone.get("/api/tasks")).status).toBe(404);
  });

  test("health needs no sign-in", async () => {
    expect(await (await browser().get("/api/health")).json()).toEqual({ status: "ok", database: "ready" });
  });
});
