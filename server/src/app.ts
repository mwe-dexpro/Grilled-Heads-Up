import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createAuth } from "./auth.js";
import { createSyncRoutes } from "./sync.js";

export interface AppConfig {
  db: DatabaseSync;
  /** The built PWA to serve; none in the server tests. */
  clientDir?: string;
  /** Where the app is served from; see `AuthConfig.origins`. */
  origins: string[];
}

/**
 * The app shell (`index.html` of the build), read once. A route handler that answered from the file would touch the file
 * system for every request; this one sends a string. None when the build has no `index.html` (the tests, development);
 * a file that is there and cannot be read stops the server from starting.
 */
function readAppShell(clientDir: string): string | undefined {
  const file = resolve(clientDir, "index.html");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

export function createApp({ db, clientDir, origins }: AppConfig): express.Express {
  const app = express();
  const auth = createAuth(db, { origins });

  app.get("/api/health", (_req, res) => {
    const { ok } = db.prepare("SELECT 1 AS ok").get() as { ok: number };
    res.json({ status: "ok", database: ok === 1 ? "ready" : "unavailable" });
  });

  app.use("/api/auth", auth.routes);

  // Every other API route holds the owner's data, so it needs a signed-in session.
  app.use("/api", auth.requireSignIn);

  // Tasks and Events travel between the owner's devices through here (ADR-0004).
  app.use("/api/sync", createSyncRoutes(db));

  // The owner's passkeys.
  app.get("/api/passkeys", (_req, res) => {
    const passkeys = db
      .prepare("SELECT created_at AS createdAt, last_used_at AS lastUsedAt FROM passkeys WHERE user_id = ? ORDER BY created_at")
      .all(res.locals["userId"] as string);
    res.json(passkeys);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  if (clientDir !== undefined) {
    app.use(
      express.static(clientDir, {
        // `/` is the app shell below, like every other address of a screen.
        index: false,
        setHeaders(res, path) {
          // Hashed build assets never change; everything else (sw.js, manifest) must revalidate
          // so a new deploy reaches installed apps.
          res.setHeader("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
        },
      }),
    );

    // Client-side routes fall back to the app shell, which must revalidate too (a new deploy restarts the server).
    const appShell = readAppShell(clientDir);
    if (appShell !== undefined) {
      app.get(/^\/(?!api\/).*/, (_req, res) => {
        res.setHeader("Cache-Control", "no-cache");
        res.type("html").send(appShell);
      });
    }
  }

  return app;
}
