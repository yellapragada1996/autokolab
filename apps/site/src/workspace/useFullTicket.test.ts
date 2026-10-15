import { describe, expect, it } from "vitest";
import { ticket } from "./fixtures";
import { fullTicketView, needsFullTicket } from "./useFullTicket";

describe("full ticket view", () => {
  it("keeps an open ticket loaded when the workspace returns a new list object", () => {
    const full = ticket({ key: "SH-1", description: "Context", done_means: ["Works"] });
    const listed = { ...full, description: undefined, done_means: undefined };
    const loaded = { id: full.id, updatedAt: full.updated_at, ticket: full };

    expect(fullTicketView(listed, null, false).loading).toBe(true);
    const first = fullTicketView(listed, loaded, false);
    expect(first).toMatchObject({ loading: false, ticket: { description: "Context", done_means: ["Works"] } });

    // A workspace reload creates a new row even when this ticket has not changed.
    const afterReload = fullTicketView({ ...listed }, loaded, false);
    expect(afterReload).toMatchObject({ loading: false, ticket: { description: "Context", done_means: ["Works"] } });
    expect(needsFullTicket({ ...listed }, loaded, false)).toBe(false);

    // A real ticket change updates the visible status while the full record refetches.
    const changedRow = { ...listed, status: "review" as const, updated_at: "2026-10-10T09:00:00Z" };
    expect(needsFullTicket(changedRow, loaded, false)).toBe(true);
    const changed = fullTicketView(changedRow, loaded, false);
    expect(changed).toMatchObject({ loading: false, ticket: { status: "review", description: "Context" } });
  });

  it("shows loading only when no full record exists for the selected ticket", () => {
    const first = ticket({ key: "SH-1" });
    const second = ticket({ key: "SH-2", description: undefined });
    expect(fullTicketView(second, { id: first.id, updatedAt: first.updated_at, ticket: first }, false).loading).toBe(true);
  });
});
