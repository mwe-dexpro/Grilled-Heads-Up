import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The app shell (`index.html` of the build), read once. A route handler that answered from the file would touch the file
 * system for every request; this one sends a string. None when the build has no `index.html` (the tests, development);
 * a file that is there and cannot be read stops the server from starting.
 *
 * The one place of the server that opens a file named by a setting (`CLIENT_DIR`) outside the database: the lint rule for a
 * non-literal path is off for this file only (eslint.config.js), so a route handler elsewhere that does the same is reported.
 */
export function readAppShell(clientDir: string): string | undefined {
  const file = resolve(clientDir, "index.html");
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}
