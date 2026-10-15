import { describe, expect, it } from "vitest";
import type { Need } from "./captain";
import { DecisionNotifier } from "./decisionNotifications";

const need = (key: string, question: string, kind: Need["kind"] = "ticket_question"): Need => ({
  key, kind, action: "Answer a question", question, ticket: null, turnId: null, since: "2026-10-15T09:00:00Z",
});

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
};

describe("decision notifications", () => {
  it("notifies once for a new question, including after unrelated ticket updates", () => {
    const sent: string[] = [];
    const notifier = new DecisionNotifier(storage(), "person.project");
    notifier.sync([need("ticket:1", "First question?")], true, (n) => sent.push(n.question));
    expect(sent).toEqual([]); // already visible when the tab opened
    notifier.sync([need("ticket:1", "First question?"), need("ticket:2", "New question?")], true, (n) => sent.push(n.question));
    notifier.sync([need("ticket:2", "New question?")], true, (n) => sent.push(n.question));
    notifier.sync([need("ticket:2", "New question?", "ticket_question")], true, (n) => sent.push(n.question));
    expect(sent).toEqual(["New question?"]);
    notifier.sync([need("ticket:2", "A different question?")], true, (n) => sent.push(n.question));
    expect(sent).toEqual(["New question?", "A different question?"]);
  });

  it("shares its record with another tab and ignores problems", () => {
    const shared = storage();
    const first = new DecisionNotifier(shared, "person.project");
    const second = new DecisionNotifier(shared, "person.project");
    const sent: string[] = [];
    first.sync([], true, () => {});
    second.sync([], true, () => {});
    const incoming = [need("ticket:1", "What next?"), need("ticket:2", "The run failed", "problem")];
    first.sync(incoming, true, (n) => sent.push(n.key));
    second.sync(incoming, true, (n) => sent.push(n.key));
    expect(sent).toEqual(["ticket:1"]);
  });

  it("does not replay a request that arrived while opted out", () => {
    const sent: string[] = [];
    const notifier = new DecisionNotifier(storage(), "person.project");
    notifier.sync([], false, () => {});
    notifier.sync([need("ask:1", "May I start?")], false, (n) => sent.push(n.key));
    notifier.sync([need("ask:1", "May I start?")], true, (n) => sent.push(n.key));
    notifier.sync([need("ask:1", "May I start?"), need("plan:2", "OK this plan?", "plan")], true, (n) => sent.push(n.key));
    expect(sent).toEqual(["plan:2"]);
  });
});
