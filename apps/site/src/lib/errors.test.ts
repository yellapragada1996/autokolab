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
  ["AUTOKOLAB_BAD: SELECT * FROM tickets", fallback],
  ["AUTOKOLAB_BAD: Error\n at load (data.ts:3)", fallback],
  ["AUTOKOLAB_BAD: tickets_pkey", fallback],
];

describe("plainError", () => {
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
