import { describe, expect, it } from "vitest";
import { fileDiffUrl, sha256Hex } from "./diffLink";

describe("the GitHub file-diff link (AK-134)", () => {
  it("hashes the file path with SHA-256", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // A real GitHub anchor: PR #96's Settings.tsx (checked against github.com).
    expect(sha256Hex("apps/site/src/workspace/Settings.tsx")).toBe("0778ad34b72d49fa892b6e872120b8fc9e1507c4d0495ea752938d604f1292de");
  });

  it("points a file at its diff on GitHub", () => {
    const url = fileDiffUrl("https://github.com/ana/shop/pull/45", "src/a.ts");
    expect(url).toBe(`https://github.com/ana/shop/pull/45/files#diff-${sha256Hex("src/a.ts")}`);
  });

  it("works with a PR link that carries a query or hash", () => {
    expect(fileDiffUrl("https://github.com/ana/shop/pull/45?x=1", "src/a.ts")).toMatch(/\/pull\/45\/files#diff-/);
    expect(fileDiffUrl("https://github.com/ana/shop/pull/45#top", "src/a.ts")).toMatch(/\/pull\/45\/files#diff-/);
  });

  it("has no link without a github.com PR", () => {
    expect(fileDiffUrl(null, "src/a.ts")).toBeNull();
    expect(fileDiffUrl(undefined, "src/a.ts")).toBeNull();
    expect(fileDiffUrl("https://gitlab.com/ana/shop/merge_requests/1", "src/a.ts")).toBeNull();
    expect(fileDiffUrl("https://github.com/ana/shop/issues/45", "src/a.ts")).toBeNull();
  });
});
