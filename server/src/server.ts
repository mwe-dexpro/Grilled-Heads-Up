import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./database.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const clientDir = resolve(process.env.CLIENT_DIR ?? resolve(here, "../../client/dist"));
const databaseFile = resolve(process.env.DATABASE_FILE ?? resolve(here, "../../data/grilled-heads-up.sqlite"));

const db = openDatabase(databaseFile);
const app = express();

app.get("/api/health", (_req, res) => {
  const { ok } = db.prepare("SELECT 1 AS ok").get() as { ok: number };
  res.json({ status: "ok", database: ok === 1 ? "ready" : "unavailable" });
});

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

const server = app.listen(port, () => {
  console.log(`Grilled Heads-Up listening on http://localhost:${port} (database: ${databaseFile})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
