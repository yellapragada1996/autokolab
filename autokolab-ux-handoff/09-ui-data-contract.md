# 09 · UI data contract

What the screens need from the backend. **Map these onto the existing schema**; don't rename or duplicate tables that already exist (tickets, decisions, people, agents, room messages, runs are already built). Where something is new (asks, briefing, intent classification, notification tiers), the shapes below are suggestions.

## Entities

```ts
type Project = { id; key: 'AK'; name; mergeMode: 'ask' | 'auto_safe' | 'hands_off'; riskyPaths: string[]; autoDbUpdates: boolean };

type Person = { id; name; initials; role: 'admin' | 'member'; city; timeZone; os?: 'macOS' | 'Linux' | 'Windows';
  presence: 'here' | 'away'; lastSeenAt; lastCatchUpAt;   // catch-up counts from lastCatchUpAt (DEC-25)
  notify: { blocking: boolean; quietHours?: { start: '22:00'; end: '08:00'; enabled: boolean } } };

type Agent = { id; name; ownerId; machine: { id; label: "Raghav's Mac"; os }; vendor: 'claude_code' | 'codex' | 'api';
  role: 'captain' | 'worker'; model; effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  effortSetBy: { kind: 'owner' | 'captain'; reason?: string; ticketId? }; locked: boolean;
  status: 'working' | 'idle' | 'waiting_on_person' | 'paused' | 'offline';
  currentTicketId?; currentStep?: { index: number; total: number; label: string };
  lastRun?: { model; effort; minutes }; usageToday: { hours: number; limitHours?: number }; toolsBlocked?: boolean };

type Goal = { id; title; status: 'moving' | 'waiting_on_you' | 'not_started' | 'done'; ticketIds: string[]; startedAt };

type Ticket = { id; key: 'AK-42'; goalId; title; summary /* plain English, 1-2 sentences */;
  status: 'todo' | 'building' | 'reviewing' | 'needs_you' | 'shipped';
  risk: Array<'database' | 'auth' | 'dependencies' | 'ci'>; mergePath: 'merges_itself' | 'waits_for_you';
  assigneeId?; order?: number; dependsOn: string[]; blocks: string[];
  brief: { whatToDo; notInScope; doneMeans: Array<{ text; done: boolean }> };
  steps: Array<{ label; state: 'done' | 'current' | 'upcoming' | 'person'; at?; link? }>;
  pr?: { number; base; files: number; additions: number; deletions: number;
         tests: { passed; failed; total; running: boolean };
         approval?: { by: 'captain'; commit; at }; mergedAt?; pinnedCommit? };
  limits: { minutesUsed; minutesMax }; branch; decisionIds: string[] };

type Decision = { id; key: 'DEC-24'; kind: 'rule' | 'product' | 'contract' | 'process' | 'architecture';
  title; why; contractShape?: string; status: 'in_force' | 'replaced'; replacedBy?;
  fromRef: { type: 'ticket' | 'heads_up' | 'roadmap' | 'conversation'; id };
  decidedBy: string[]; lastDeliveredAt; lastDeliveredTo };
```

## The conversation

```ts
type Message = {
  id; threadId /* 'captain:<personId>' | 'side:<personId>:<agentId>' | 'room:<thread>' */;
  authorType: 'person' | 'captain' | 'agent' | 'system'; authorId; createdAt;
  context?: { type: 'ticket' | 'goal' | 'decision' | 'agent' | 'person'; id; label };  // from the slide-over
  kind: 'text' | 'catch_up' | 'plan' | 'ask' | 'quiet_updates' | 'heads_up' | 'captain_note' | 'failure' | 'contract_recorded';
  text?: string;
  payload?: CatchUp | PlanRef | Ask | QuietUpdate[] | HeadsUpRef;
};

type CatchUp = { awayHours: number; shipped: Item[]; handled: Item[]; decided: Item[] };
type Item = { text; at; link? };

type Ask = {                                       // anything that "needs you"
  id; tier: 'blocking' | 'can_wait' | 'fyi';
  kind: 'risky_merge' | 'product_question' | 'plan_approval' | 'conflict' | 'ambiguity';
  audience: string[];                              // person ids (both people for a conflict)
  question: string;                                // the one specific question
  lineThatMatters?: { code: string; plainWords: string };
  options: Array<{ id; label; consequence?; recommended?: boolean; primary?: boolean }>;
  evidence: Evidence; preview?: { imageUrl? };
  blocking?: { agentIds: string[]; costText: 'Fjord is idle until you answer.' };
  createdAt; answeredBy?; answer?; answeredAt?; undo?: { available: boolean; reasonIfNot? };
};

type Evidence = {
  tests?: { passed; total; newCount?; runUrl?; running?: boolean };
  review?: { commit; builtBy; reviewedBy: 'captain' | string; note };
  changes?: { dbUpdates: number; codeFiles: number; additions; deletions };
  decisions?: Array<{ key; title }>; trail?: string[];
  lessSure: string;                                // required; 'Nothing I'm unsure about here.' if none
};

type Briefing = {
  workClause: '3 agents are building Google sign-in.'; needsCount: number; next: string; updatedAt;
  goals: Array<{ id; title; segments: Array<'done' | 'needs_you' | 'building' | 'todo'>; done; total }>;
  agents: Array<{ agentId; name; doing: string; step?: string; needsYou?: boolean }>;
};
```

Captain composes `workClause`, `next`, catch-ups and questions. The UI only renders them; it never builds sentences from raw data except the fallbacks listed in S01.

## Endpoints / actions (names are suggestions)

| Action | Input | Result |
| --- | --- | --- |
| `sendMessage` | threadId, text, context? | the person's message (optimistic), then streamed Captain events |
| `classifyIntent` | text | `'big' | 'small' | 'question'` in < 150 ms |
| `answerAsk` | askId, optionId, note? | updated Ask + side effects (merge, brief change) |
| `undoAsk` | askId | updated Ask, or `{ available: false, reason }` |
| `approvePlan` / `requestPlanChange` | planId, (text or structured edits) | plan status |
| `setEffort` / `setModel` | agentId, value | agent (owner/admin only) |
| `setMergeMode`, `setRiskyPaths`, `setAutoDbUpdates`, `setNotify` | value | updated settings |
| `pauseAll` / `resumeAll` | – | agents |
| `markHeadsUpReviewed` | headsUpId | heads-up |
| `exportAudit` | period | file |

## Realtime events (subscribe per project)

`message.created`, `captain.step` (live steps while composing), `ask.created|answered|expired`, `briefing.updated`, `ticket.updated` (status, step, pr.tests), `agent.updated` (status, step), `decision.created`, `heads_up.created`, `typing` (room and side threads), `presence.updated`.

## Server-side rules the UI relies on
- Nobody can approve their own work (already enforced in the database; the UI also never offers it).
- Merges are pinned to the approved commit.
- Catch-up is computed from `lastCatchUpAt`.
- Blocking asks notify at most once per 2 hours, never while the person is typing on any device, and not during quiet hours.
- History rows are written by the database, not by agents.
