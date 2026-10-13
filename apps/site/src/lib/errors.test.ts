import { describe, expect, it, vi } from "vitest";
import { plainError, reportError } from "./errors";

const fallback = "Something went wrong. Try again; if it keeps happening, tell Captain.";
const cases: [unknown, string][] = [
  [new Error("AUTOKOLAB_TITLE: Give the ticket a title."), "Give the ticket a title."],
  [{ message: "AUTOKOLAB_FORBIDDEN: Only the owner can do that" }, "Only the owner can do that."],
  ["permission denied for table tickets", "You don't have permission to do that here."],
  ["new row violates row-level security policy for table tickets", "You don't have permission to do that here."],
  [{ code: "42501", message: "restricted" }, "You don't have permission to do that here."],
  ["JWT expired", "Your sign-in expired. Reload the page."],
  ["invalid refresh token", "Your sign-in expired. Reload the page."],
  [{ code: "PGRST301", message: "invalid" }, "Your sign-in expired. Reload the page."],
  ["Your sign-in is invalid", "Your sign-in expired. Reload the page."],
  ["Could not find the function public.allow_merge in the schema cache", "This needs the latest database update. Ask the project's owner to apply it."],
  ['column "model" does not exist', "This needs the latest database update. Ask the project's owner to apply it."],
  [{ code: "42883", message: "missing" }, "This needs the latest database update. Ask the project's owner to apply it."],
  [{ code: "PGRST204", message: "missing" }, "This needs the latest database update. Ask the project's owner to apply it."],
  ...["Failed to fetch", "NetworkError", "Load failed", "fetch failed", "request timed out", "timeout"].map((message): [unknown, string] => [message, "Couldn't reach AutoKolab. Check your connection and try again."]),
  [{ name: "AbortError", message: "aborted" }, "Couldn't reach AutoKolab. Check your connection and try again."],
  [new Error('invalid input syntax for type uuid: "t10"'), fallback],
  ['duplicate key violates unique constraint "tickets_pkey"', fallback],
  ['null value in column "title" violates not-null constraint', fallback],
  ["Unexpected token in JSON", fallback],
  ["unrecognised failure", fallback],
  [null, fallback], [undefined, fallback], [42, fallback], [{}, fallback], [{ message: 9 }, fallback],
  ["", fallback],
  ["AUTOKOLAB_BAD: ", fallback],
  ["AUTOKOLAB_BAD: invalid uuid syntax", fallback],
  ["AUTOKOLAB_BAD: https://example.com/private", fallback],
  ["SELECT * FROM tickets", fallback],
  ["duplicate key in tickets", fallback],
  ["null value in tickets", fallback],
  ["AUTOKOLAB_BAD: example.invalid/private", fallback],
  ["AUTOKOLAB_BAD: ftp://example.com/private", fallback],
  ["AUTOKOLAB_BAD: 10000000-0000-0000-0000-000000000001", fallback],
  ["AUTOKOLAB_UPDATE: Ask the owner to update AutoKolab.", "Ask the owner to update AutoKolab."],
  ["AUTOKOLAB_BAD: Error\n at load (data.ts:3)", fallback],
  ["tickets_pkey", fallback],
];

describe("plainError", () => {
  it.each([
    ["AUTOKOLAB_SECRET: the ticket looks like it contains a key or token", "The ticket looks like it contains a key or token."],
    ["AUTOKOLAB_SECRET: the comment looks like it contains a key or token", "The comment looks like it contains a key or token."],
    ["AUTOKOLAB_SECRET: the guide looks like it contains a key or token", "The guide looks like it contains a key or token."],
    ["AUTOKOLAB_SECRET: message rejected because it looks like it contains a key or token", "Message rejected because it looks like it contains a key or token."],
    ["AUTOKOLAB_NOT_FOUND: octocat hasn't signed in to AutoKolab yet", "Octocat hasn't signed in to AutoKolab yet."],
    ["AUTOKOLAB_BAD_INVITE: this invite has expired", "This invite has expired."],
    ["AUTOKOLAB_BAD_INVITE: this invite has expired; ask for a new one", "This invite has expired; ask for a new one."],
    ["AUTOKOLAB_TAKEN: a project with that short name already exists", "A project with that short name already exists."],
    ['AUTOKOLAB_NAME_TAKEN: "octocat_agent" is already taken', '"octocat_agent" is already taken.'],
    ['AUTOKOLAB_BAD_REVIEW: "line" needs both the file and the code.', '"line" needs both the file and the code.'],
    ["AUTOKOLAB_PROFILE: Your profile couldn't be created. Sign out and sign in with GitHub again.", "Your profile couldn't be created. Sign out and sign in with GitHub again."],
    ["AUTOKOLAB_FORBIDDEN: You can't post in this project's room.", "You can't post in this project's room."],
  ])("preserves app-authored guidance: %s", (message, expected) => {
    expect(plainError(new Error(message), "save the ticket")).toBe(expected);
  });
  it("trusts vocabulary in app-authored sentences", () => {
    expect(plainError("AUTOKOLAB_FORMAT: the table needs JSON in snake_case for this schema.")).toBe("The table needs JSON in snake_case for this schema.");
  });
  it("rejects empty, multiline or overlong app-authored messages", () => {
    for (const message of ["", "   ", "Try again.\n", "Try again.\rMore details", "a".repeat(241)]) {
      expect(plainError(`AUTOKOLAB_BAD: ${message}`)).toBe(fallback);
    }
  });
  it.each(cases)("formats %j without technical wording", (error, expected) => {
    const output = plainError(error);
    expect(output).toBe(expected);
    expect(output).not.toMatch(/uuid|syntax|constraint|relation|column|JWT|https?:|\n|AUTOKOLAB_/i);
  });
  it("names the action for unknown and malformed failures", () => {
    expect(plainError(new Error("duplicate key"), "save the ticket")).toBe("Couldn't save the ticket. Try again; if it keeps happening, tell Captain.");
    expect(plainError(false, "send your message")).toBe("Couldn't send your message. Try again; if it keeps happening, tell Captain.");
  });
  it("does not echo unsafe action descriptions", () => {
    for (const what of ["", "load https://example.com", "save the uuid", "save tickets_pkey", "run SQL", "save\n at data.ts:1"]) expect(plainError(null, what)).toBe(fallback);
  });
  it("is pure; the reporting boundary logs the original object", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const original = { code: "42501", message: "permission denied for table tickets", details: "diagnostics" };
      plainError(original);
      expect(log).not.toHaveBeenCalled();
      expect(reportError(original, "save the ticket")).toBe(plainError(original));
      expect(log).toHaveBeenCalledExactlyOnceWith(original);
    } finally { log.mockRestore(); }
  });
});
