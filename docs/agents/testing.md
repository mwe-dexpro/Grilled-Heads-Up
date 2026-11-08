# Test and security quality bar

A green pipeline has to mean something: **a broken behaviour turns a required check red, new code is proven by tests that can fail, and nothing unsafe is merged.** Read `CONTEXT.md` and `docs/v1-scope.md` first: tests assert the behaviour defined there, in its terms, not whatever the code happens to do.

Work as a reviewer of your own change. A test that passes proves nothing until you have seen it fail for the right reason.

## Before a change is done

- [ ] **Every new or changed behaviour has tests for the happy path, the error paths and the likely edge cases** (the prompt list below).
- [ ] **Each new test has been seen to fail.** Break the code by hand (the most likely bug), or check that Stryker's mutants on the new code are killed. No surviving mutant on new code unless its reason is written down (README, "Mutation testing").
- [ ] **Tests assert results and states that can be seen**, not only calls on mocks. No snapshot-only tests, no tautologies (the expected value worked out by the code's own logic), no `.only`, no `.skip`, `skipIf`, `runIf`, `todo` or `fixme` without an issue.
- [ ] **New source files are covered automatically** by the mutation and coverage globs: no config edit was needed. A new `.ts` file with no test fails `unit` (per-file floors). No threshold was lowered.
- [ ] **`npm run typecheck` and `npm run lint` pass with zero warnings.** Violations were fixed in the code. No new `any`, `as` cast, `!` assertion, `eslint-disable` or baseline entry; if one is truly the last resort it names its rule, says why, and has a follow-up issue.
- [ ] **No dependency with a high or critical advisory, or a GPL or AGPL licence, was added**, and every new dependency is justified in the pull request.
- [ ] **The same checks that CI runs were run locally** (the commands below).
- [ ] **CI was never made green by weakening** a test, a threshold or a security check.

## Edge cases to ask about

For every behaviour, ask which of these apply, and test those:

- empty or no data;
- boundaries: first and last item, zero, maximum length;
- dates and time zones: day boundaries, daylight-saving changes (the unit tests run in `Europe/Berlin`);
- offline and sync: conflicts, out-of-order or duplicate replicas (HLC), a device whose clock is wrong;
- repeated or concurrent actions: a double tap, two tabs, two requests at once;
- unicode and long text;
- failure of the thing underneath: IndexedDB, the network, the server, an expired or missing session.

Weak patterns to fix when you meet them: asserting on mocks or calls only, tautologies, snapshot-only tests, an `expect` that is never reached (an async assertion without `await`), over-mocking that bypasses the code under test, `.only`/`.skip`/`todo` left in, dependence on timing or test order, and end-to-end tests that wait with fixed timeouts instead of for the visible state (use the page's clock or a state wait).

## The commands (the same as CI)

| Command | What it checks | CI job |
| --- | --- | --- |
| `npm run typecheck` | `tsc` in client, server, tools and for `e2e/` and the config files, with `strict` and the stricter flags (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, …) | `typecheck` |
| `npm run lint` | ESLint (typed `strictTypeChecked` and `stylisticTypeChecked`, React hooks, Vitest, Playwright, security, Node rules; `--max-warnings 0`), knip (dead files, exports and dependencies), the Prettier check, and `lint:skips` (a test that is left out names its issue: `.skip`, `skipIf`, `runIf`, `todo`, `fixme`, `skip` taken from the test context, `test.info().skip()`; the disable may be a block comment over several lines; inline rule settings such as `/* eslint rule: "off" */` are refused outright) | `lint` |
| `npm run format` | Prettier, to fix what `lint:format` reports | |
| `npm run test:unit` | Vitest in client, server and tools **with coverage**; below a workspace's thresholds it fails; a `.only` fails | `unit` |
| `npm run test:e2e` | builds and runs Playwright against three servers with in-memory databases | `e2e` |
| `npm run test:mutation` | Stryker in client, server and tools; each fails below its `break` score | `mutation (client)`, `mutation (server)`, `mutation (tools)` |
| `npm run security:allowlist` | `.github/security-allowlist.json` is valid, nothing has expired, nothing runs longer than 90 days | `npm audit` |
| `npm run security:audit` | `npm audit` fails on a high or critical advisory the allowlist does not allow | `npm audit` |

Run a single workspace with `-w`, e.g. `npm run test:mutation -w server` (about 2 minutes), or Stryker on one file with `npx stryker run --mutate src/auth.ts` inside the workspace. CI also runs, without a local command: `npm audit signatures` (with `npx npm@11.21.2`; the npm 10 of Node 22 cannot verify one package's attestation, see the workflow), dependency review on pull requests (fails on high severity and on GPL/AGPL licences), CodeQL (`security-extended`; a result of a rule with a security severity of 7.0 or more fails, and so does one the gate cannot classify: an unknown rule, or a security rule without a severity; a SARIF file with no run, or a run without a `results` list, fails too, as the analysis did not finish), gitleaks over the whole history, and Trivy on the Docker image and on the Dockerfile (HIGH and CRITICAL, no `--ignore-unfixed`).

Thresholds only go up. Coverage thresholds are in each workspace's `vitest.config.ts` (the measured value rounded down); mutation `break` is in each `stryker.config.json` (never below 80). Raise them when a change lifts the score; never lower one to get green.

Coverage is measured for every file, and gated **per file** in the client and in tools (Vitest `perFile`): every gated file has to reach the floors on its own, so a new `.ts` file that no test reaches fails `unit` whatever its size (a floor on the total over a folder left room for a small untested module). The floors are the measured values of the weakest file, rounded down (in the client every file is at 100% for lines, statements and functions, and those floors stay at 99, the value of the total they replace):

| Workspace | Gated files | lines | statements | functions | branches |
| --- | --- | --- | --- | --- | --- |
| client | `src/**/!(use[A-Z]*).ts`: every `.ts` file but React hooks | 99 | 99 | 99 | 90 |
| tools | `src/*.ts` and `src/!(bin)/**/*.ts`: every module, in any folder | 98 | 98 | 96 | 92 |
| server | everything, as one total over four files (a new untested file of any size fails it: the headroom is under a point) | 93 | 93 | 92 | 87 |

Not gated, on purpose: client components (`*.tsx`) and hooks (only the end-to-end tests reach them, so a new component cannot turn `unit` red), and the command-line wrappers in tools' `src/bin/` (run as processes by `bin.test.ts`, which coverage cannot see). The whole-tree figures of the client (components and hooks included) stay in the summary. A per-file floor replaces the old total over the same files: it is looser for one weak file (the weakest file sets the branch floor, 90 in the client) and tighter for a new one (0% fails).

## What is mutation-tested and what is not

Stryker mutates every `src/**/*.ts` of client, server and tools by glob, so a new file is included without editing a list. Excluded, each by glob and for a reason:

| Excluded | Why |
| --- | --- |
| `*.tsx` (not matched by `src/**/*.ts`) | React components: there is no React unit-test setup (README, "Not covered by a test"); the end-to-end tests cover them, and Stryker does not run those. Coverage still measures them. |
| `client/src/**/use[A-Z]*.ts` | React hooks (use, then a capital: a file like `user.ts` or `useful.ts` stays in), for the same reason. |
| `client/src/main.tsx`, `server/src/server.ts` | Entry points that read the environment and start listening. |
| `**/*.test.ts`, `src/**/testing/**`, `tools/src/fixtures/**` | Tests and their helpers. |
| `tools/src/bin/**` | One-line command-line wrappers; the code they run is in `src/cli.ts`, which is mutated, and `bin.test.ts` starts every wrapper as a process. |

Anything else stays in, `app/navigation.ts` and `auth/authApi.ts` included (they are tested with a fake browser and a fake `fetch`). Adding an exclusion needs a reason in this table and in the README.

## An exception to a security gate

The gates fail on high and critical findings. The only way past one is an entry in **`.github/security-allowlist.json`**, never a lowered severity or an ignore file of its own:

```json
{
  "entries": [{ "tool": "npm-audit", "id": "GHSA-xxxx-xxxx-xxxx", "reason": "Why it does not apply or cannot be fixed yet.", "expires": "2027-01-31" }]
}
```

- `tool` is `npm-audit`, `trivy`, `codeql` or `gitleaks`; `id` is the advisory (GHSA or CVE) for the first two, the rule id for `codeql`, the finding's fingerprint for `gitleaks`.
- `reason` says why, `expires` is the last day it holds, **at most 90 days from the day you add it**. After that day CI fails again (`npm run security:allowlist`, and the scanner itself for Trivy, whose `exp:` is written as the day after `expires`). An entry that has run out is renewed with a new reason, or the finding is fixed.
- Every entry has a follow-up issue that removes it; name it in the reason.
- The Trivy and gitleaks entries become `.trivyignore` and `.gitleaksignore` right before those scanners run (`npm run security:ignorefiles`); both files are git-ignored.
- Fix the finding first: for the Docker image that means a newer base digest or less in the image, not an exception. The file holds one entry today: CodeQL's `js/missing-rate-limiting` for the passkey routes (the server has no rate limiter the query recognises; a follow-up issue adds one and removes the entry). The entry excuses the rule for the whole repository until its day, so a new route that touches the file system or the database per request is not caught by CodeQL meanwhile: keep such a handler free of file access (the app shell is read once at start) and review new routes by hand.

## Maintainer settings (a pull request cannot change these)

Switch on in the repository settings:

- **Dependabot alerts** and **Dependabot security updates** (Settings, Advanced Security). `.github/dependabot.yml` already asks for weekly version updates of npm, GitHub Actions and the Docker base image.
- **Branch protection** for `main`: require a pull request and require these status checks (the names are those of the jobs in `.github/workflows/ci.yml`):

  `typecheck`, `lint`, `unit`, `e2e`, `mutation (client)`, `mutation (server)`, `mutation (tools)`, `docker`, `npm audit`, `dependency review`, `codeql`, `secrets`

- The workflow also runs every night (03:17 UTC) and on demand. A CVE published for code that has not changed turns the nightly run on `main` red; GitHub's own notification of a failed scheduled run (an email to the person who last changed the schedule) is how the maintainer hears of it. Watch the repository's Actions notifications if more people should.
- GitHub switches a scheduled workflow off after 60 days without any activity in a public repository (it sends a warning email first). After a quiet spell, push something or re-enable the workflow in the Actions tab, or the nightly CVE check silently stops.
- The repository is public, so CodeQL and dependency review need no GitHub Advanced Security licence.

## Pins that nobody updates for you

Dependabot bumps the `uses:` lines of the workflow, the Docker base image and the npm packages, and nothing else. Three versions in `.github/workflows/ci.yml` are bumped by hand, with a pull request, about once a quarter:

| Pin | Where | How to bump |
| --- | --- | --- |
| Trivy (version, download URL and its SHA-256) | `docker` job, step "Install Trivy" | Take the newest release, copy the checksum of `trivy_<version>_Linux-64bit.tar.gz` from the release's `checksums.txt`, run both Trivy steps locally. Trivy logs `Module will be skipped as current version of Trivy is older than minimum trivy version required` when its check bundle needs a newer Trivy: that is the sign that the pin is too old, because those checks are not run. |
| gitleaks image (digest) | `secrets` job | Take the digest of the newest `ghcr.io/gitleaks/gitleaks` release tag and put the version in the comment. |
| npm 11 for `npm audit signatures` | `audit` job | Take the newest npm 11; drop the pin when Node 22's own npm can verify the tree. |

The workflow's own comment says the same. The licence gate (`deny-licenses`) names GPL and AGPL only (the exact SPDX ids in `ci.yml`); LGPL, MPL and other licences pass it.
