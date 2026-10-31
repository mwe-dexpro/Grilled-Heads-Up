# Grilled Heads-Up

A personal calendar and to-do app that links Tasks to the Events they prepare for, and warns when an Event is At risk. It ships as an installable PWA (Android/Chrome first) with a small Node + SQLite server.

- What it is and why: [docs/Konzept.md](docs/Konzept.md), [docs/v1-scope.md](docs/v1-scope.md)
- Domain terms (use these in code): [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)

## Layout

```
client/   React + Vite PWA (TypeScript). Tasks and Events live in the browser's IndexedDB.
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
npm run build && npm start   # once, in a second terminal: the API, incl. sign-in
npm run dev                  # Vite dev server with hot reload, http://localhost:5173
```

The dev server passes `/api` on to the server at port 3000. The service worker only runs in the built app, so check offline behaviour with `npm run build && npm start`.

### Sign in

The app opens with a sign-in screen (ADR-0006). On first launch, *Create passkey* registers a passkey and makes you the **Owner**; the app then shows a **Recovery code** once, to print or store. After that, nobody else can register: more passkeys (e.g. for a laptop that doesn't share Google Password Manager) are added with *Add a passkey* at the bottom of the home screen, while signed in. If no passkey is at hand, the recovery code signs you in, shows its replacement once (each use spends the code) and offers to create a passkey. *New recovery code* replaces a code that got lost. Passkeys must check who holds them (fingerprint, face or screen lock); a security key that only senses a touch is refused.

A device that was signed in keeps working offline (its data is on the device); the server checks the session again when it can be reached. Passkeys only work on `localhost` or HTTPS, and are bound to the address the app is opened at (see `ORIGIN` below).

### Install on an Android phone

The PWA needs HTTPS (or `localhost`) to be installable. To try it on a phone during development, forward the port over USB (`chrome://inspect` → *Port forwarding* → `3000` → `localhost:3000`), open `http://localhost:3000` in Chrome on the phone and choose *Install app*. The app then starts from its home-screen icon without browser UI and works in airplane mode.

## Test

```sh
npm test               # unit tests, then end-to-end tests
npm run test:unit      # Vitest: domain rules, stores, routes, formats, translations; server sign-in
npm run test:e2e       # builds, starts the servers, runs Playwright on an emulated Pixel 7
npm run test:mutation  # Stryker mutation tests on the client domain modules
npm run typecheck
```

First time only, install the browser for the end-to-end tests: `npx playwright install chromium`. If a Chromium is already installed elsewhere, point to it instead with `CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

What is tested where:

| Seam | Tool | Covers |
| --- | --- | --- |
| Bucket rules (`client/src/home/buckets.ts`, `days.ts`) | Vitest | which Bucket a Task or Event goes in, midnight, Late, Progress, Overdue emphasis, a Task row's second line |
| Event rules (`client/src/events/event.ts`) | Vitest | time zones incl. clock changes, days an Event covers, validation, Linked task dates from Offsets, Event Progress |
| Stores (`client/src/tasks/taskStore.ts`, `client/src/events/eventStore.ts`) | Vitest + fake-indexeddb | add, Complete, link and unlink, persistence across reopen (reload), upgrade from older data |
| Routes and formats (`client/src/app/routes.ts`, `*/format*.ts`) | Vitest | screen addresses, dates, times and Offsets in English and German |
| Translations (`client/src/i18n/i18n.ts`) | Vitest | English and German have the same texts, English default, choice remembered |
| Start screen (`client/src/auth/session.ts`) | Vitest | setup, sign-in or the app, from the server's answer or, offline, from what the device remembers |
| Server sign-in (`server/src/auth.ts`) | Vitest + a software passkey (`server/src/testing/`) over HTTP | registration, the owner rule (also two first launches at once), user verification, sign-in, replayed and foreign-site answers, capped waiting sign-ins, recovery and new codes, sign-out, data routes rejecting requests that aren't signed in |
| The whole app | Playwright | Tasks survive reload and work offline, Buckets, Events with Linked tasks (Offsets, moving, unlinking), tabs, language switch, installable manifest |
| Sign-in in the browser (`e2e/sign-in.spec.ts`) | Playwright + Chrome's virtual authenticator | first launch with a recovery code, the owner rule, passkey sign-in on Android and (synced) on desktop, recovery on a new phone, data routes |

The end-to-end tests run two servers, each with an in-memory database: the sign-in tests start from a first launch on their own server; on the other, `e2e/owner.setup.ts` registers the owner once and the app's tests start signed in.

Unit tests run with the device time zone fixed to `Europe/Berlin` (set in `client/vitest.config.ts`), so day and time-zone tests mean the same on every machine, including daylight-saving changes.

**Mutation testing** changes the code under test in small ways (a flipped condition, a removed call) and checks that a test fails for each change. The build fails below a score of 80; the HTML report is written to `client/reports/mutation/index.html`. Known survivors: the localStorage keys' names (language, signed in), the default database name (only used by the running app), `close()`, and a few equivalent mutants (a change no input can tell apart); none of them change behaviour.

**Regression testing:** CI (`.github/workflows/ci.yml`) runs typecheck, unit, end-to-end and mutation tests and a Docker smoke test on every pull request and every push to `main`.

## Data model notes

- **Events** are stored in the shape of Outlook/iCalendar events (ADR-0002): start and end, an all-day flag, the time zone of timed Events (IANA name; all-day Events are floating), and `externalSource` / `externalId`, which are null for Events created in the app and will hold e.g. `"outlook"` and the Outlook id once Outlook sync arrives after v1. See `client/src/events/event.ts`.
- **Linked tasks** store their Event and an Offset in days, not a date (ADR-0003). Their date is always the Event's start date plus the Offset, so they follow when the Event moves.

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
| `DATABASE_FILE` | `data/grilled-heads-up.sqlite` | SQLite file, created if missing; `:memory:` for a throwaway database (tests) |
| `ORIGIN` | `http://localhost:$PORT` (plus `http://localhost:5173` unless `NODE_ENV=production`) | the address(es) the app is opened at, comma-separated, e.g. `https://heads-up.example.com`. Passkeys are bound to the first one's host name; with `https:` the session cookie is `Secure` |

`GET /api/health` answers `{"status":"ok","database":"ready"}`. Sign-in lives under `/api/auth/`; every other `/api/` route answers 401 without a signed-in session.
