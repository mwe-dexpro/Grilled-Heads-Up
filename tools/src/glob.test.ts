import { describe, expect, it } from "vitest";
import { matchesGlob } from "./glob.js";

describe("matchesGlob", () => {
  it("matches a path that is the glob, and no other", () => {
    expect(matchesGlob("server/src/auth.ts", "server/src/auth.ts")).toBe(true);
    expect(matchesGlob("server/src/auth.ts", "server/src/sync.ts")).toBe(false);
    expect(matchesGlob("server/src/auth.ts", "server/src/auth.tsx")).toBe(false);
    expect(matchesGlob("server/src/auth.ts", "xserver/src/auth.ts")).toBe(false);
    expect(matchesGlob("server/src/auth.ts", "server/src")).toBe(false);
    expect(matchesGlob("", "")).toBe(true);
    expect(matchesGlob("", "a.ts")).toBe(false);
  });

  it("takes a dot, a plus and the other characters of a regular expression as themselves", () => {
    expect(matchesGlob("a.ts", "a.ts")).toBe(true);
    expect(matchesGlob("a.ts", "aXts")).toBe(false);
    expect(matchesGlob("a+b(1)[x]$^|.ts", "a+b(1)[x]$^|.ts")).toBe(true);
  });

  it("lets * stand for any text inside one folder level, also none", () => {
    expect(matchesGlob("server/src/*.ts", "server/src/auth.ts")).toBe(true);
    expect(matchesGlob("server/src/*.ts", "server/src/.ts")).toBe(true);
    expect(matchesGlob("server/src/*.ts", "server/src/testing/auth.ts")).toBe(false);
    expect(matchesGlob("server/src/*.ts", "server/src/auth.js")).toBe(false);
    expect(matchesGlob("server/*/auth.ts", "server/src/auth.ts")).toBe(true);
    expect(matchesGlob("server/*/auth.ts", "server/src/more/auth.ts")).toBe(false);
    expect(matchesGlob("a*c*e", "abcde")).toBe(true);
    expect(matchesGlob("a*c*e", "abde")).toBe(false);
  });

  it("lets ? stand for one character of a folder level", () => {
    expect(matchesGlob("auth?.ts", "auth1.ts")).toBe(true);
    expect(matchesGlob("auth?.ts", "auth.ts")).toBe(false);
    expect(matchesGlob("auth?.ts", "auth12.ts")).toBe(false);
    expect(matchesGlob("a?c", "a/c")).toBe(false);
  });

  it("lets a ** folder stand for any number of folders, also none", () => {
    expect(matchesGlob("server/**/auth.ts", "server/auth.ts")).toBe(true);
    expect(matchesGlob("server/**/auth.ts", "server/src/auth.ts")).toBe(true);
    expect(matchesGlob("server/**/auth.ts", "server/src/more/auth.ts")).toBe(true);
    expect(matchesGlob("server/**/auth.ts", "client/src/auth.ts")).toBe(false);
    expect(matchesGlob("server/**/auth.ts", "server/src/sync.ts")).toBe(false);
    expect(matchesGlob("server/src/**", "server/src/auth.ts")).toBe(true);
    expect(matchesGlob("server/src/**", "server/src/testing/key.ts")).toBe(true);
    expect(matchesGlob("server/src/**", "server/other/auth.ts")).toBe(false);
    expect(matchesGlob("**/auth.ts", "auth.ts")).toBe(true);
    expect(matchesGlob("**", "any/path/at/all.ts")).toBe(true);
  });
});
