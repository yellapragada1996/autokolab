import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { looksLikeSecret, redactSecrets } from "../src/core/secrets.js";
import { formatToken, memberEmail, parseToken } from "../src/core/token.js";

describe("tokens", () => {
  const id = "3f1c2a9e-1b2c-4d5e-8f90-123456789abc";
  it("round-trips", () => {
    const t = formatToken(id, "s".repeat(43));
    expect(parseToken(t)).toEqual({ memberId: id, email: memberEmail(id), password: "s".repeat(43) });
  });
  it("rejects malformed tokens", () => {
    expect(() => parseToken("ak1.nope.secretsecretsecretsecret")).toThrow(/AutoKolab token/);
    expect(() => parseToken(`ak2.${id}.secretsecretsecretsecret`)).toThrow();
    expect(() => parseToken(`ak1.${id}.short`)).toThrow();
  });
  it("tokens themselves count as secrets", () => {
    expect(looksLikeSecret(formatToken(id, "x".repeat(43)))).toBe(true);
  });
});

describe("secret detection", () => {
  const bad = [
    "sk-ant-api03-abcdefghijklmnopqrstuv",
    "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz0123",
    "AKIAIOSFODNN7EXAMPLE",
    "-----BEGIN RSA PRIVATE KEY-----",
    "xoxb-1234567890-abcdefghij",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    "sk_live_abcdefghijklmnop",
  ];
  it.each(bad)("flags %s", (s) => expect(looksLikeSecret(`use ${s} please`)).toBe(true));
  it("leaves normal text alone", () => {
    for (const s of ["Fix the zones API", "See PR #12, branch zones-api", "sk-learn is a library", "commit 3f1c2a9e1b2c"]) {
      expect(looksLikeSecret(s)).toBe(false);
    }
  });
  it("redacts", () => {
    expect(redactSecrets("key: ghp_abcdefghijklmnopqrstuvwxyz0123456789 end")).toBe("key: [redacted] end");
  });
  it("matches the database's pattern list", () => {
    const sql = readFileSync(new URL("../sql/001_init.sql", import.meta.url), "utf8");
    const block = sql.slice(sql.indexOf("function public.looks_like_secret"), sql.indexOf("-- ---", sql.indexOf("function public.looks_like_secret")));
    const sqlPatterns = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    const src = readFileSync(new URL("../src/core/secrets.ts", import.meta.url), "utf8");
    const tsPatterns = [...src.matchAll(/^\s+\/(.+)\/i,$/gm)].map((m) => m[1].replace(/\\\//g, "/"));
    expect(tsPatterns.map((p) => p.replace(/\\\\/g, "\\"))).toEqual(sqlPatterns);
  });
});
