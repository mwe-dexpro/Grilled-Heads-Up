import express from "express";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createAuth } from "./auth.js";

export interface AppConfig {
  db: DatabaseSync;
  /** The built PWA to serve; none in the server tests. */
  clientDir?: string;
  /** Where the app is served from; see `AuthConfig.origins`. */
  origins: string[];
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

  // The owner's passkeys; the first data route (Tasks and Events follow with sync).
  app.get("/api/passkeys", (_req, res) => {
    const passkeys = db
      .prepare("SELECT created_at AS createdAt, last_used_at AS lastUsedAt FROM passkeys WHERE user_id = ? ORDER BY created_at")
      .all(res.locals.userId as string);
    res.json(passkeys);
  });

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  if (clientDir) {
    app.use(
      express.static(clientDir, {
        setHeaders(res, path) {
          // Hashed build assets never change; everything else (index.html, sw.js, manifest) must revalidate
          // so a new deploy reaches installed apps.
          res.setHeader(
            "Cache-Control",
            path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
          );
        },
      }),
    );

    // Client-side routes fall back to the app shell.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(resolve(clientDir, "index.html"));
    });
  }

  return app;
}
