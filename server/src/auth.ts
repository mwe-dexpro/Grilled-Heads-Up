import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import express, { type Request, type RequestHandler, type Response } from "express";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface AuthConfig {
  /** Where the app is served from, e.g. `https://heads-up.example.com`. The first one's host name is the passkeys' RP ID. */
  origins: string[];
}

export interface Auth {
  /** The sign-in routes, to mount at `/api/auth`. */
  routes: express.Router;
  /** Rejects requests without a valid session with 401; otherwise sets `res.locals.userId`. */
  requireSignIn: RequestHandler;
}

const rpName = "Grilled Heads-Up";
const sessionCookie = "session";
const ceremonyCookie = "passkey-ceremony";
const sessionDays = 180;
const ceremonyMinutes = 5;

/** A passkey registration or sign-in that has handed out a challenge and waits for the browser's answer. */
interface Ceremony {
  kind: "register" | "signIn";
  challenge: string;
  /** For a registration: the WebAuthn user handle, and whether it is the first passkey, creating the owner. */
  userId?: string;
  newOwner?: boolean;
  expires: number;
}

interface PasskeyRow {
  id: string;
  user_id: string;
  public_key: Uint8Array;
  counter: number;
  transports: string;
}

/**
 * Passkey sign-in with a recovery code (ADR-0006). The first passkey registered creates the owner, the
 * only user in v1; after that, passkeys can only be added from a signed-in session. Sessions live in
 * an HttpOnly cookie, and only a hash of the session token and of the recovery code is stored.
 */
export function createAuth(db: DatabaseSync, { origins }: AuthConfig): Auth {
  const rpID = new URL(origins[0]).hostname;
  const secure = origins[0].startsWith("https:");
  const ceremonies = new Map<string, Ceremony>();

  function now() {
    return new Date().toISOString();
  }

  function ownerExists() {
    return db.prepare("SELECT 1 FROM users LIMIT 1").get() !== undefined;
  }

  function signedInUser(req: Request): string | null {
    const token = readCookie(req, sessionCookie);
    if (!token) return null;
    const row = db
      .prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
      .get(hash(token), now()) as { user_id: string } | undefined;
    return row?.user_id ?? null;
  }

  function startSession(res: Response, userId: string) {
    const token = randomBytes(32).toString("base64url");
    const created = new Date();
    const expires = new Date(created.getTime() + sessionDays * 24 * 60 * 60 * 1000);
    db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(created.toISOString());
    db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
      hash(token),
      userId,
      created.toISOString(),
      expires.toISOString(),
    );
    res.cookie(sessionCookie, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
  }

  /** Replaces the user's recovery code, so a used or shown code is the only valid one. Returns the new code. */
  function newRecoveryCode(userId: string): string {
    const code = generateRecoveryCode();
    db.prepare("UPDATE users SET recovery_code_hash = ? WHERE id = ?").run(hash(normalizeRecoveryCode(code)), userId);
    return code;
  }

  function beginCeremony(res: Response, ceremony: Omit<Ceremony, "expires">) {
    const id = randomBytes(16).toString("base64url");
    const expires = Date.now() + ceremonyMinutes * 60 * 1000;
    for (const [key, old] of ceremonies) if (old.expires < Date.now()) ceremonies.delete(key);
    ceremonies.set(id, { ...ceremony, expires });
    res.cookie(ceremonyCookie, id, { httpOnly: true, sameSite: "strict", secure, path: "/api/auth", maxAge: ceremonyMinutes * 60 * 1000 });
  }

  /** Each challenge answers once: the ceremony is forgotten as soon as it is looked up. */
  function takeCeremony(req: Request, res: Response, kind: Ceremony["kind"]): Ceremony | null {
    const id = readCookie(req, ceremonyCookie);
    res.clearCookie(ceremonyCookie, { path: "/api/auth" });
    if (!id) return null;
    const ceremony = ceremonies.get(id);
    ceremonies.delete(id);
    return ceremony && ceremony.kind === kind && ceremony.expires >= Date.now() ? ceremony : null;
  }

  const routes = express.Router();
  routes.use(express.json());

  routes.get("/session", (req, res) => {
    res.json({ owner: ownerExists(), signedIn: signedInUser(req) !== null });
  });

  routes.post("/register/options", async (req, res) => {
    const userId = signedInUser(req);
    if (!userId && ownerExists()) {
      res.status(403).json({ error: "An owner exists. Sign in to add a passkey." });
      return;
    }
    const handle = userId ?? randomBytes(16).toString("base64url");
    const existing = userId
      ? (db.prepare("SELECT id, transports FROM passkeys WHERE user_id = ?").all(userId) as { id: string; transports: string }[])
      : [];
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: rpName,
      userDisplayName: rpName,
      userID: new Uint8Array(Buffer.from(handle, "base64url")),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({ id: p.id, transports: JSON.parse(p.transports) as string[] })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    });
    beginCeremony(res, { kind: "register", challenge: options.challenge, userId: handle, newOwner: !userId });
    res.json(options);
  });

  routes.post("/register/verify", async (req, res) => {
    const ceremony = takeCeremony(req, res, "register");
    if (!ceremony?.userId) {
      res.status(400).json({ error: "No passkey registration is under way." });
      return;
    }
    // Checked again: another browser may have become the owner, or this one signed out, meanwhile.
    const allowed = ceremony.newOwner ? !ownerExists() : signedInUser(req) === ceremony.userId;
    if (!allowed) {
      res.status(403).json({ error: "An owner exists. Sign in to add a passkey." });
      return;
    }
    const verification = await verifyRegistrationResponse({
      response: req.body as RegistrationResponseJSON,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      requireUserVerification: false,
    }).catch(() => null);
    if (!verification?.verified) {
      res.status(400).json({ error: "The passkey couldn't be verified." });
      return;
    }
    const { credential } = verification.registrationInfo;
    const userId = ceremony.userId;
    let recoveryCode: string | null = null;
    db.exec("BEGIN");
    try {
      if (ceremony.newOwner) {
        recoveryCode = generateRecoveryCode();
        db.prepare("INSERT INTO users (id, recovery_code_hash, created_at) VALUES (?, ?, ?)").run(
          userId,
          hash(normalizeRecoveryCode(recoveryCode)),
          now(),
        );
      }
      db.prepare(
        "INSERT INTO passkeys (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(credential.id, userId, credential.publicKey, credential.counter, JSON.stringify(credential.transports ?? []), now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    if (ceremony.newOwner) startSession(res, userId);
    res.json({ recoveryCode });
  });

  routes.post("/sign-in/options", async (_req, res) => {
    // No allowCredentials: the passkey is discoverable, so the browser offers it without a user name.
    const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
    beginCeremony(res, { kind: "signIn", challenge: options.challenge });
    res.json(options);
  });

  routes.post("/sign-in/verify", async (req, res) => {
    const ceremony = takeCeremony(req, res, "signIn");
    const response = req.body as AuthenticationResponseJSON;
    const passkey =
      typeof response?.id === "string"
        ? (db.prepare("SELECT * FROM passkeys WHERE id = ?").get(response.id) as PasskeyRow | undefined)
        : undefined;
    if (!ceremony || !passkey) {
      res.status(401).json({ error: "Sign-in didn't work." });
      return;
    }
    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: ceremony.challenge,
      expectedOrigin: origins,
      expectedRPID: rpID,
      credential: {
        id: passkey.id,
        publicKey: new Uint8Array(passkey.public_key),
        counter: passkey.counter,
        transports: JSON.parse(passkey.transports) as string[],
      },
      requireUserVerification: false,
    }).catch(() => null);
    if (!verification?.verified) {
      res.status(401).json({ error: "Sign-in didn't work." });
      return;
    }
    db.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?").run(
      verification.authenticationInfo.newCounter,
      now(),
      passkey.id,
    );
    startSession(res, passkey.user_id);
    res.status(204).end();
  });

  routes.post("/recover", (req, res) => {
    const code = (req.body as { code?: unknown } | undefined)?.code;
    const user =
      typeof code === "string"
        ? (db.prepare("SELECT id FROM users WHERE recovery_code_hash = ?").get(hash(normalizeRecoveryCode(code))) as
            | { id: string }
            | undefined)
        : undefined;
    if (!user) {
      res.status(401).json({ error: "That recovery code doesn't match." });
      return;
    }
    // The used code is spent; the new one is shown once, like the first.
    const recoveryCode = newRecoveryCode(user.id);
    startSession(res, user.id);
    res.json({ recoveryCode });
  });

  routes.post("/sign-out", (req, res) => {
    const token = readCookie(req, sessionCookie);
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
    res.clearCookie(sessionCookie, { path: "/" });
    res.status(204).end();
  });

  const requireSignIn: RequestHandler = (req, res, next) => {
    const userId = signedInUser(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in first." });
      return;
    }
    res.locals.userId = userId;
    next();
  };

  return { routes, requireSignIn };
}

/** 20 characters of Crockford base32 (100 bits), in groups of four: `7K2M-…`. */
export function generateRecoveryCode(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const characters = Array.from({ length: 20 }, () => alphabet[randomInt(alphabet.length)]);
  return characters.join("").match(/.{4}/g)!.join("-");
}

/** Ignores case, spaces and dashes, and reads the letters people mistake for digits as those digits. */
export function normalizeRecoveryCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

function hash(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of req.headers.cookie?.split(";") ?? []) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
