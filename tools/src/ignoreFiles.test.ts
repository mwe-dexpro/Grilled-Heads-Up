import { describe, expect, it } from "vitest";
import type { AllowlistEntry } from "./allowlist.js";
import { gitleaksIgnore, trivyIgnore } from "./ignoreFiles.js";

const entry = (fields: Partial<AllowlistEntry>): AllowlistEntry => ({
  tool: "trivy",
  id: "CVE-2026-0001",
  reason: "Not reachable.",
  expires: "2026-12-31",
  ...fields,
});

describe("trivyIgnore", () => {
  it("writes each Trivy entry as its id and the day it runs out, under the reason as a comment", () => {
    const text = trivyIgnore([entry({}), entry({ id: "CVE-2026-0002", reason: "Fixed in the next base image.", expires: "2027-01-15" })]);

    expect(text).toBe(
      [
        "# Generated from .github/security-allowlist.json by `npm run security:ignorefiles`. Do not edit; do not commit.",
        "# Not reachable.",
        "CVE-2026-0001 exp:2026-12-31",
        "# Fixed in the next base image.",
        "CVE-2026-0002 exp:2027-01-15",
        "",
      ].join("\n"),
    );
  });

  it("leaves out the entries of other tools", () => {
    const text = trivyIgnore([
      entry({ tool: "npm-audit", id: "GHSA-1" }),
      entry({ tool: "codeql", id: "js/x" }),
      entry({ tool: "gitleaks", id: "fingerprint" }),
      entry({}),
    ]);

    expect(text).toContain("CVE-2026-0001");
    expect(text).not.toMatch(/GHSA-1|js\/x|fingerprint/);
  });

  it("writes only the header for an empty allowlist: Trivy then excepts nothing", () => {
    expect(trivyIgnore([])).toBe("# Generated from .github/security-allowlist.json by `npm run security:ignorefiles`. Do not edit; do not commit.\n");
  });

  it("keeps a reason on one line, so that no part of it is read as an entry", () => {
    const text = trivyIgnore([entry({ reason: "Line one.\nCVE-9999-9999 exp:2099-01-01\r\nLine three." })]);

    expect(text.split("\n")).toContain("# Line one. CVE-9999-9999 exp:2099-01-01 Line three.");
    expect(text.split("\n").filter((line) => !line.startsWith("#") && line !== "")).toEqual(["CVE-2026-0001 exp:2026-12-31"]);
  });

  it("trims a reason, and joins its lines with one space however many line breaks lie between them", () => {
    expect(trivyIgnore([entry({ reason: "  padded  " })])).toContain("\n# padded\n");
    expect(trivyIgnore([entry({ reason: "one\n\n  two\r\n\r\nthree" })])).toContain("\n# one two three\n");
    expect(trivyIgnore([entry({ reason: "a b  c" })])).toContain("\n# a b  c\n");
  });

  it("still writes an entry that has run out: Trivy drops it by its date, and the allowlist check fails it as well", () => {
    expect(trivyIgnore([entry({ expires: "2020-01-01" })])).toContain("CVE-2026-0001 exp:2020-01-01");
  });
});

describe("gitleaksIgnore", () => {
  it("writes each gitleaks entry's fingerprint under the reason as a comment", () => {
    const text = gitleaksIgnore(
      [entry({ tool: "gitleaks", id: "abc123:docs/example.md:generic-api-key:12", reason: "An example key from the docs." })],
      "2026-11-07",
    );

    expect(text).toBe(
      [
        "# Generated from .github/security-allowlist.json by `npm run security:ignorefiles`. Do not edit; do not commit.",
        "# An example key from the docs. (until 2026-12-31)",
        "abc123:docs/example.md:generic-api-key:12",
        "",
      ].join("\n"),
    );
  });

  it("leaves out the entries of other tools", () => {
    const text = gitleaksIgnore([entry({}), entry({ tool: "npm-audit", id: "GHSA-1" })], "2026-11-07");

    expect(text).toBe("# Generated from .github/security-allowlist.json by `npm run security:ignorefiles`. Do not edit; do not commit.\n");
  });

  it("leaves out an entry that has run out, since gitleaks knows no dates and would go on excepting it", () => {
    const text = gitleaksIgnore([entry({ tool: "gitleaks", id: "old-fingerprint", expires: "2020-01-01" })], "2026-11-07");

    expect(text).not.toContain("old-fingerprint");
  });

  it("keeps an entry on its last day", () => {
    expect(gitleaksIgnore([entry({ tool: "gitleaks", id: "today-fingerprint", expires: "2026-11-07" })], "2026-11-07")).toContain("today-fingerprint");
  });
});
