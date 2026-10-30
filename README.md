# Grilled Heads-Up

A personal calendar and to-do app that links Tasks to the Events they prepare for, and warns when an Event is At risk. It ships as an installable PWA (Android/Chrome first) with a small Node + SQLite server.

- What it is and why: [docs/Konzept.md](docs/Konzept.md), [docs/v1-scope.md](docs/v1-scope.md)
- Domain terms (use these in code): [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)

## Layout

```
client/   React + Vite PWA (TypeScript). Tasks live in the browser's IndexedDB.
server/   Node + Express server: serves the built PWA, owns the SQLite file.
e2e/      Playwright end-to-end tests, run against the built app served by the server.
```

npm workspaces; run every command below from the repo root.

## Requirements

- Node 22 (see `.nvmrc`)
- Docker with Compose, for the container

## Run

**Everything in Docker (one command):**

```sh
docker compose up --build
```

Open http://localhost:3000. The SQLite file lives in the `data` volume at `/data/grilled-heads-up.sqlite`. Set `PORT=8080` in front of the command to use another port.

**Without Docker:**

```sh
npm install
npm run build   # builds client and server
npm start       # http://localhost:3000, SQLite file in ./data/
```

**While developing the UI:**

```sh
npm run dev     # Vite dev server with hot reload, http://localhost:5173
```

The service worker only runs in the built app, so check offline behaviour with `npm run build && npm start`.

### Install on an Android phone

The PWA needs HTTPS (or `localhost`) to be installable. To try it on a phone during development, forward the port over USB (`chrome://inspect` → *Port forwarding* → `3000` → `localhost:3000`), open `http://localhost:3000` in Chrome on the phone and choose *Install app*. The app then starts from its home-screen icon without browser UI and works in airplane mode.

## Test

```sh
npm test               # unit tests, then end-to-end tests
npm run test:unit      # Vitest: Task store and translations
npm run test:e2e       # builds, starts the server, runs Playwright on an emulated Pixel 7
npm run test:mutation  # Stryker mutation tests on the client domain modules
npm run typecheck
```

First time only, install the browser for the end-to-end tests: `npx playwright install chromium`. If a Chromium is already installed elsewhere, point to it instead with `CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

What is tested where:

| Seam | Tool | Covers |
| --- | --- | --- |
| Task store (`client/src/tasks/taskStore.ts`) | Vitest + fake-indexeddb | add, Complete, order, persistence across reopen (reload) |
| Translations (`client/src/i18n/i18n.ts`) | Vitest | English and German have the same texts, English default, choice remembered |
| The whole app | Playwright | add + Complete survive reload, works offline, installable manifest, language switch |

**Mutation testing** changes the code under test in small ways (a flipped condition, a removed call) and checks that a test fails for each change. The build fails below a score of 80; the HTML report is written to `client/reports/mutation/index.html`. Known survivors: the localStorage key's name, the default database name (only used by the running app) and `close()`, none of which the store's behaviour exposes.

**Regression testing:** CI (`.github/workflows/ci.yml`) runs typecheck, unit, end-to-end and mutation tests and a Docker smoke test on every pull request and every push to `main`.

## Translations

Every UI text lives in `client/src/i18n/en.json` and `client/src/i18n/de.json`. Add a key to both files; a unit test fails if the files do not have the same keys (a key missing in German also fails the typecheck). Placeholders use `{name}`, e.g. `"task.completeNamed": "Complete {title}"`. In code, get texts with `const { t } = useI18n()` and `t("task.add")`. The German wording follows the *German UI* labels in [CONTEXT.md](CONTEXT.md).

## Build

```sh
npm run build         # client/dist (PWA incl. service worker) and server/dist
docker compose build  # production image
```

Server configuration (environment variables):

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `CLIENT_DIR` | `client/dist` | built PWA to serve |
| `DATABASE_FILE` | `data/grilled-heads-up.sqlite` | SQLite file, created if missing |

`GET /api/health` answers `{"status":"ok","database":"ready"}`.
