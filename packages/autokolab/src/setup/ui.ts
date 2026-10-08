import { createInterface } from "node:readline";

// Small terminal helpers for the setup wizards: steps, checkmarks, prompts with defaults.

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const bold = paint("1");
export const dim = paint("2");
export const green = paint("32");
export const yellow = paint("33");
export const red = paint("31");
export const cyan = paint("36");

/** Answer every prompt with its default (--yes, or no terminal). */
let assumeYes = !process.stdin.isTTY;
export function setAssumeYes(v: boolean): void {
  assumeYes = v || !process.stdin.isTTY;
}

export function step(n: number, total: number, title: string): void {
  console.log(`\n${bold(`${n}/${total}  ${title}`)}`);
}
export const ok = (msg: string) => console.log(`  ${green("✓")} ${msg}`);
export const warn = (msg: string) => console.log(`  ${yellow("!")} ${msg}`);
export const info = (msg: string) => console.log(`  ${dim(msg)}`);
export const fail = (msg: string) => console.log(`  ${red("✗")} ${msg}`);

function prompt(question: string, hidden: boolean): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(question);
      };
    }
    rl.question(question, (a) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(a.trim());
    });
  });
}

export async function ask(question: string, def = "", opts: { hidden?: boolean; required?: boolean; validate?: (v: string) => string | null } = {}): Promise<string> {
  if (assumeYes) {
    if (!def && opts.required) throw new Error(`Missing answer for "${question}" (running non-interactively).`);
    return def;
  }
  for (;;) {
    const shown = def && !opts.hidden ? ` ${dim(`[${def}]`)}` : "";
    const a = (await prompt(`  ${question}${shown}: `, !!opts.hidden)) || def;
    if (!a && opts.required) {
      console.log(`  ${yellow("This one's needed.")}`);
      continue;
    }
    const problem = a && opts.validate ? opts.validate(a) : null;
    if (problem) {
      console.log(`  ${yellow(problem)}`);
      continue;
    }
    return a;
  }
}

export async function confirm(question: string, def = true): Promise<boolean> {
  if (assumeYes) return def;
  const a = (await prompt(`  ${question} ${dim(def ? "[Y/n]" : "[y/N]")} `, false)).toLowerCase();
  if (!a) return def;
  return a.startsWith("y");
}

export async function pressEnter(message: string): Promise<void> {
  if (assumeYes) return;
  await prompt(`  ${message} `, false);
}

/** "Ana María" → "ana-maria" */
export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export const NAME_RULE = (v: string) => (/^[a-z0-9][a-z0-9-]{1,40}$/.test(v) ? null : "Use lowercase letters, digits and dashes (at least 2 characters).");
