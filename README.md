# Grilled Heads-Up

A personal calendar and to-do app that links Tasks to the Events they prepare for, and warns when an Event is At risk. It ships as an installable PWA (Android/Chrome first) with a small Node + SQLite server.

- What it is and why: [docs/Konzept.md](docs/Konzept.md), [docs/v1-scope.md](docs/v1-scope.md)
- Domain terms (use these in code): [CONTEXT.md](CONTEXT.md)
- Decisions: [docs/adr/](docs/adr/)

## Layout

```
client/   React + Vite PWA (TypeScript). Tasks and Events live in the browser's IndexedDB and sync through the server.
server/   Node + Express server: serves the built PWA, owns the SQLite file (sign-in, sync).
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
npm run test:unit      # Vitest: domain rules, stores, sync, routes, formats, translations; server sign-in and sync
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
| Reschedule, Trash and swipe rules (`client/src/tasks/reschedule.ts`, `trash.ts`, `availableActions.ts`, `client/src/ui/swipe.ts`) | Vitest | the Reschedule options and their dates (next Monday from every weekday, month and year ends, daylight saving), never today for an Overdue Task, a Linked task's new Offset, the reschedule count, the Trash's 30-day boundary and days left, which actions a Task offers, the edge zones, drag clamping and the open/close threshold of a swipe |
| Stores (`client/src/tasks/taskStore.ts`, `client/src/events/eventStore.ts`) | Vitest + fake-indexeddb | add, Complete, Reschedule, link and unlink, delete, Trash and restore (exactly as it was; expired Tasks), persistence across reopen (reload), upgrade from older data |
| Sync on the device (`client/src/sync/`) | Vitest + fake-indexeddb, two or three devices (own database and clock each) syncing through an in-memory server (`sync/testing/memoryServer.ts`) | the clock (order, ties, overflow), the outbox and field clocks, per-field merge, deletion, a local change racing a pull, an Event form saved after a remote edit, link against unlink, records that arrived in part (including the calculations of every Event and Task screen), large and refused pushes (what is set aside, what is not, and when it is tried again, also through the real HTTP transport), an Event's time written as a unit, a clock that runs behind, paging and the saved cursor, data from before sync, unknown record types, a record type registered in a test, every registered record type's name and fields against the server's name rules, a restore beating an older delete from the other device, a Reschedule on both devices, offline / signed out / failed, coalescing runs, the status line, the auto-sync triggers |
| Server sync (`server/src/sync.ts`) | Vitest over HTTP | 401 without a session, push then pull, older and equal clocks ignored, a later clock moves the field to the end of the feed, paging, malformed or oversized batches refused whole (413 over 1 MB, nothing stored) |
| Routes and formats (`client/src/app/routes.ts`, `*/format*.ts`) | Vitest | screen addresses, dates, times and Offsets in English and German |
| Translations (`client/src/i18n/i18n.ts`) | Vitest | English and German have the same texts, English default, choice remembered |
| Start screen (`client/src/auth/session.ts`) | Vitest | setup, sign-in or the app, from the server's answer or, offline, from what the device remembers |
| Server sign-in (`server/src/auth.ts`) | Vitest + a software passkey (`server/src/testing/`) over HTTP | registration, the owner rule (also two first launches at once), user verification, sign-in, replayed and foreign-site answers, capped waiting sign-ins, recovery and new codes, sign-out, data routes rejecting requests that aren't signed in |
| The whole app | Playwright | Tasks survive reload and work offline, Buckets, Events with Linked tasks (Offsets, moving, unlinking), tabs, language switch, installable manifest |
| Task actions in the browser (`e2e/task-actions.spec.ts`) | Playwright, the page's clock set to a fixed day | swipe (mouse drag) to Reschedule, Complete and Delete, swipes from the screen edges ignored, the Reschedule sheet (no Today, the date picker starts tomorrow, next week = next Monday), Reschedule all…, the undo toast (clear of the "+" button and the tab bar, gone after 5 seconds), the Trash (restore, expiry after 30 days), long press, Task detail, a Linked task's Offset, German |
| Sign-in in the browser (`e2e/sign-in.spec.ts`) | Playwright + Chrome's virtual authenticator | first launch with a recovery code, the owner rule, passkey sign-in on Android and (synced) on desktop, recovery on a new phone, data routes |
| Sync in the browser (`e2e/sync.spec.ts`) | Playwright, two browser contexts as two devices | a Task added offline reaches the other device once the connection is back (no button), Completing syncs back, the status line and its time after a reload, what a screen reader is told, an expired session leads to sign-in (the Task is still in the database, shows after signing in again and syncs), a tab whose database was upgraded elsewhere asks for a reload, the sync routes refuse strangers |

The end-to-end tests run three servers, each with an in-memory database: the sign-in tests start from a first launch on their own server; on the second, `e2e/owner.setup.ts` registers the owner once and the app's tests start signed in; the third, with an owner of its own (`e2e/sync-owner.setup.ts`), is for the sync tests, whose two devices share that owner. The app's tests import `test` from `e2e/fixtures.ts`, which blocks `/api/sync/`, so they don't pass Tasks to each other through their shared owner (the app then shows its offline sync status).

**Not covered by a test:** the React wiring has no unit tests (there is no React test setup). Screens are covered through the pure functions they call, and `app/listReader.ts` (which makes a reload deliver only the newest read) is tested on its own. That `useAppData` sets its stores before its first read (so that a sync finishing while the stores are still opening is not lost), and that `changeTasks` reloads also when a change fails, are therefore checked only by reading the code and by the end-to-end tests. The same goes for the pointer handling of `ui/SwipeRow.tsx` (the rules it uses are tested in `swipe.ts`; the drag itself in `e2e/task-actions.spec.ts`), and for the undo toast's 5-second timer in `App.tsx` (end-to-end test with the page's clock moved on). The same goes for the `maxLength` of the Event form's inputs (the limits themselves are tested in `validateEvent` and the stores).

Unit tests run with the device time zone fixed to `Europe/Berlin` (set in `client/vitest.config.ts`), so day and time-zone tests mean the same on every machine, including daylight-saving changes.

**Mutation testing** changes the code under test in small ways (a flipped condition, a removed call) and checks that a test fails for each change. The build fails below a score of 80; the HTML report is written to `client/reports/mutation/index.html`. Known survivors: the localStorage keys' names (language, signed in), the default database name (only used by the running app), `close()`, and a few equivalent mutants (a change no input can tell apart); none of them change behaviour. The sync modules (`hlc.ts`, `replica.ts`, `engine.ts`, `syncDb.ts`, `autoSync.ts`, `formatSync.ts`) are mutation-tested too; their known survivors are the engine's default clock (only used by the running app), the device id being made up again when the clock isn't saved yet, and a few equivalent mutants in the engine (a queued edit is always older than the change that beats it, the server's time is also fed to the clock when pulling, the exact byte count at which a batch is full, the checks that an outbox entry still exists when its push is confirmed, which kind of failure a pull that the server refuses is reported as, the exact size (100 KB) below which a lone value refused as too big is called the server's fault, the guard against a refusal naming a change that was not sent (it fails the same way without it)). In the store readers, `wholeLink` has equivalent mutants (a Task with neither Event nor Offset is returned unchanged either way).

**Regression testing:** CI (`.github/workflows/ci.yml`) runs typecheck, unit, end-to-end and mutation tests and a Docker smoke test on every pull request and every push to `main`.

## Data model notes

- **Events** are stored in the shape of Outlook/iCalendar events (ADR-0002): start and end, an all-day flag, the time zone of timed Events (IANA name; all-day Events are floating), and `externalSource` / `externalId`, which are null for Events created in the app and will hold e.g. `"outlook"` and the Outlook id once Outlook sync arrives after v1. See `client/src/events/event.ts`.
- **Linked tasks** store their Event and an Offset in days, not a date (ADR-0003). Their date is always the Event's start date plus the Offset, so they follow when the Event moves. Rescheduling a Linked task changes its Offset, and writes `eventId`, `offsetDays` and `date` together.
- **`rescheduleCount`** on a Task counts its Reschedules (a Task getting its first date from the Inbox is scheduled, not rescheduled, so it doesn't count). It is stored and synced from v1 on and not shown yet (Smart hints come after v1). It is a field like any other, last write wins, so two devices rescheduling the same Task while apart can lose one increment; that is acceptable for a hint. Tasks saved before it existed read as 0. The name is a wire name: never rename it.

## Sync

Tasks and Events live in IndexedDB on each device and sync through the server (ADR-0004), so a Task added on the phone shows on the desktop. It only works signed in; the server refuses sync requests without a session.

**When it runs:** when the app starts signed in, when the connection comes back, when the app returns to the foreground, about 2 seconds after each local change, and once a minute while the app is visible. The home screen footer shows the outcome (*Synced 14:32*, *Syncing…*, *Offline · last synced 14:32*, *Sync failed*, *Some changes could not be synced*, *Signed out – sign in to sync*) and has a *Sync now* button. *Syncing…* shows only for a run started with that button; background runs leave the line alone until they end, and the line is not a live region (a hidden one announces it to screen readers only when it means something new). When the server says the session is gone, the app asks it again and shows the sign-in screen; local data stays.

**The protocol:** the unit is a **Change**: one field of one record (`type`, `id`, `field`, `value`, `hlc`). Every field except `id` syncs on its own, so a title edited on one device and a date edited on another both survive; when the same field was edited on both, the later change wins on every device. All fields a store operation names (e.g. linking a Task: `eventId`, `offsetDays`, `date`) share one clock and are all sent, also those whose value stays the same, so they win or lose together. A store operation reads, changes and writes the record in one IndexedDB transaction (`Table.update`), so a sync that lands meanwhile is never overwritten by a stale copy; the Event form sends only the fields the person changed, except that a change to *when* the Event is (all-day, start and end date, start and end time, time zone) sends all six of those fields together, so that two devices' competing edits of the time never mix into an Event neither made. Each device keeps an *outbox* of changes the server hasn't confirmed (a newer edit of a field replaces the older queued one) and, per record, the clock of every field (`fieldClocks` store). A sync pushes the outbox to `POST /api/sync/push`, then pulls `GET /api/sync/pull?after=<cursor>` page by page and applies each Change whose clock is later than the local one. The server keeps only the winning value per field (table `sync_fields`, per owner) and knows no record types.

**Large and refused pushes:** the app caps what a person can enter (titles and locations 200 characters, notes 10,000; the inputs stop at the cap and `client/src/data/limits.ts` has the numbers), so no single value comes near the server's limit. A push is split into requests of at most 500 changes and about 400 KB (the server takes 1 MB, so only a lone value, which gets a request of its own however big, can be refused as too big; behind a proxy with a limit below 400 KB, lower `batchBytes` in `engine.ts`). The client sets a change aside only when it is certain that the change itself is bad: our server answers a malformed batch with `400 { index }` naming the first malformed change (that one is set aside and the rest is sent in a new request), and a lone value over 100 KB refused with 413 is set aside too. Any other refusal says the server is unwell, not the changes: a 400 that names no change (a proxy, a captive portal, a server bug), a 413 for anything smaller or for several changes, or a 5xx ends the push after that one request, nothing is set aside, the status is *Sync failed*, and the next sync sends everything. A set-aside change stays in the outbox, unsent, and the status line says *Some changes could not be synced*; it is tried again an hour after it was set aside (the check runs at every push, and the mark survives a restart of the app), and a newer edit of the same field (e.g. a shorter note) replaces it and is sent at once. Until then the value is on this device only. A push that fails for another reason does not keep the pull from running.

**Deleting** is a field too: `deletedAt` (the time, or `null`) is an ordinary last-write-wins field, and the record stays stored as a tombstone. Edits to other fields of a deleted record merge but never un-delete it. The stores' `list…` functions leave deleted records out.

**The Trash** builds on the tombstones: a deleted Task shows in the Trash (`#/trash`, linked from the home footer until Settings exist) for 30 × 24 hours, newest deletion first. *Restore* is a later write of `deletedAt` itself (`null`, one field, one outbox entry, `Table.restore`), so it beats the older delete on every device, like any later edit of a field; a delete made after the restore wins again. A Task deleted 30 days ago or longer is no longer listed and can't be restored, but its tombstone stays stored (it is what keeps sync from bringing the Task back from another device), and tombstones are never compacted. The Trash's rules are in `client/src/tasks/trash.ts`.

**The clock** is a hybrid logical clock ([ADR-0010](docs/adr/0010-hybrid-logical-clock-orders-sync-changes.md), `client/src/sync/hlc.ts`): wall time, a counter and the device id as fixed-width text, so string order is time order. A device moves its clock past everything it sees, including the server's time in each answer, so an edit made after seeing another device's change wins even on a slow clock. A device whose clock runs far ahead wins concurrent edits until real time catches up.

**Data from before sync:** Tasks and Events saved by earlier versions get clocks and outbox entries (and `deletedAt: null`) once per record type, the first time its store is opened or the engine runs (a flag in the `syncInfo` store says it is done), so they reach the server too.

**Known limitations:** a Change of a record type this version doesn't know (from a newer app on another device) is skipped, and the cursor moves on, so an older app never receives it later. A record can be stored in part for a while, with placeholder values for the fields that have not arrived: when its Changes are split across two pull pages and the sync stops between them, when the other device's push was cut off between two of its batches (the outbox is sent in key order, so a batch can end inside a record), or when a field of it was set aside on the other device (that field arrives only once it is sent). Until the rest arrives, the lists leave out an Event that has no title, start date or end date yet (its Linked tasks show as undated, in the Inbox), screens read an Event whose time fields are incomplete as an all-day Event, and a Linked task missing its Event or Offset reads as a Task without an Event. Tombstones are never compacted. Another tab upgrading the database makes this tab's connections close; the app then shows a *Reload* screen, since nothing could be saved in this tab any more.

### Adding a record type

Lists, Tags, Subtasks, Reminders and the like need no change in the sync engine or the server:

1. Give the record `id` and `deletedAt: string | null` (the tombstone) next to its other fields; the other fields are JSON values.
2. Add its object store in `openAppDb` (`client/src/data/database.ts`) in a **new** database version (`if (oldVersion < 4) …`), and add it to `AppDb`.
3. Define its `RecordType` next to its store: `type` (the wire name), `storeName`, and `withDefaults`, which fills fields missing from records saved by older versions or built from partly arrived Changes (see `taskRecordType`).
4. Register it in the list in `client/src/sync/recordTypes.ts`.
5. In its store, open the table with `openTable(db, recordType, now)` and write only through it (`get`, `list`, `put` for a new record only (it throws when the id is taken), `update` to change a stored one, `delete`), never with `db.put`: the table stamps the clock and fills the outbox. Change a stored record with `update` (it reads and writes in one transaction); `put` can't replace a record, so a stale copy can't overwrite a sync.

Never rename a `type` or a field once shipped; the server and other devices know them by name. To rename, add a new field and stop using the old one. A type and its fields must also match the server's checks: `type` is letters starting lowercase (up to 40), a field is letters and digits starting with a letter (up to 64), and `id` is never a field. A unit test (`client/src/sync/recordTypes.test.ts`) checks every registered type against copies of the server's patterns (`typePattern`, `fieldPattern` in `server/src/sync.ts`), so a field such as `due_date` fails there, not silently on a device; change the patterns in both places.

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
