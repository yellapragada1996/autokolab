import { execFileSync } from "node:child_process";
import { platform } from "node:os";
import type { AutoKolab } from "../core/client.js";
import { readConfigFile } from "../core/config.js";
import { connectFromConfig } from "../core/node.js";
import type { Message } from "../core/types.js";

// Desktop notifications for messages meant for you: anything another member sends to you or one
// of your agents, and questions or reports in your agents' threads. Lets you know when to look at
// Claude Code / Codex (or the room) without watching it.

export function notify(title: string, body: string): void {
  try {
    if (platform() === "darwin") {
      execFileSync("osascript", ["-e", "on run argv\ndisplay notification (item 2 of argv) with title (item 1 of argv) sound name \"Glass\"\nend run", title, body]);
    } else {
      execFileSync("notify-send", ["--app-name=AutoKolab", title, body]);
    }
  } catch {
    /* no notification system available */
  }
}

export function isForMe(ak: AutoKolab, m: Message, myThreads: Set<number>): boolean {
  const mine = new Set(ak.mine().map((x) => x.id));
  if (mine.has(m.sender_id)) return false;
  if (m.to_id && mine.has(m.to_id)) return true;
  return !m.to_id && m.thread_id !== null && myThreads.has(m.thread_id) && ["question", "status", "review", "answer"].includes(m.kind);
}

/** Watch all rooms and notify about messages for you. Returns a stop function. */
export async function startNotifier(): Promise<() => Promise<void>> {
  if (!readConfigFile().me) return async () => undefined;
  const ak = await connectFromConfig();
  let last = await ak.firstMessageIdSince(new Date().toISOString());
  const myThreads = new Set<number>();
  const check = async () => {
    for (const m of await ak.messagesAfter(last)) {
      last = m.id;
      await ak.memberFresh(m.sender_id);
      if (ak.mine().some((x) => x.id === m.sender_id)) myThreads.add(m.thread_id ?? m.id);
      if (!isForMe(ak, m, myThreads)) continue;
      const to = m.to_id ? ` → ${ak.nameOf(m.to_id)}` : "";
      notify(`${ak.nameOf(m.sender_id)}${to}`, m.body.replace(/\s+/g, " ").slice(0, 180));
    }
  };
  const ch = ak.onAnyMessage(() => void check().catch(() => undefined));
  const timer = setInterval(() => void check().catch(() => undefined), 30_000);
  return async () => {
    clearInterval(timer);
    await ak.sb.removeChannel(ch);
    await ak.close();
  };
}
