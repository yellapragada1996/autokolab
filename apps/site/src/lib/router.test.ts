import { describe, expect, it } from "vitest";
import { href, isOldPath, parse } from "./router";

describe("the plan page's address", () => {
  it("is /p/<project>/plans/<message id>, both ways", () => {
    expect(parse("/p/shop/plans/19")).toEqual({ view: "plan", project: "shop", plan: 19 });
    expect(href({ view: "plan", project: "shop", plan: 19 })).toBe("/p/shop/plans/19");
  });

  it("keeps an id that isn't a number as unknown, and goes to Captain without one", () => {
    const r = parse("/p/shop/plans/abc");
    expect(r.view === "plan" && Number.isNaN(r.plan)).toBe(true);
    expect(parse("/p/shop/plans")).toEqual({ view: "captain", project: "shop" });
  });
});

describe("Captain and Overview's addresses", () => {
  it("opens Captain at /p/<project>, and Overview at /p/<project>/overview", () => {
    expect(parse("/p/shop")).toEqual({ view: "captain", project: "shop" });
    expect(href({ view: "captain", project: "shop" })).toBe("/p/shop");
    expect(parse("/p/shop/overview")).toEqual({ view: "overview", project: "shop" });
    expect(href({ view: "overview", project: "shop" })).toBe("/p/shop/overview");
  });

  it("no longer treats /overview as an old path", () => {
    expect(isOldPath("/p/shop/overview")).toBe(false);
    expect(isOldPath("/p/shop/board")).toBe(true);
  });
});
