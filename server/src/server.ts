import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { openDatabase } from "./database.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 3000);
const clientDir = resolve(process.env.CLIENT_DIR ?? resolve(here, "../../client/dist"));
const databaseFile =
  process.env.DATABASE_FILE === ":memory:"
    ? ":memory:"
    : resolve(process.env.DATABASE_FILE ?? resolve(here, "../../data/grilled-heads-up.sqlite"));
// Passkeys are bound to the address the app is opened at. In development the Vite dev server (port 5173) proxies the API here.
const origins = process.env.ORIGIN
  ? process.env.ORIGIN.split(",").map((origin) => origin.trim())
  : [`http://localhost:${port}`, ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"])];

const db = openDatabase(databaseFile);
const app = createApp({ db, clientDir, origins });

const server = app.listen(port, () => {
  console.log(`Grilled Heads-Up listening on http://localhost:${port} (database: ${databaseFile}, passkeys for ${origins.join(", ")})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
