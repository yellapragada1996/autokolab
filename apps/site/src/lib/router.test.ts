import { describe, expect, it } from "vitest";
import { href, parse } from "./router";

describe("the plan page's address", () => {
  it("is /p/<project>/plans/<message id>, both ways", () => {
    expect(parse("/p/shop/plans/19")).toEqual({ view: "plan", project: "shop", plan: 19 });
    expect(href({ view: "plan", project: "shop", plan: 19 })).toBe("/p/shop/plans/19");
  });

  it("keeps an id that isn't a number as unknown, and goes to Captain without one", () => {
    const r = parse("/p/shop/plans/abc");
    expect(r.view === "plan" && Number.isNaN(r.plan)).toBe(true);
    expect(parse("/p/shop/plans")).toEqual({ view: "overview", project: "shop" });
  });
});
