import { spawn } from "node:child_process";
import { platform } from "node:os";

export function openBrowser(url: string): void {
  const cmd = platform() === "darwin" ? "open" : platform() === "win32" ? "explorer" : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true })
    .on("error", () => console.log(`Open this in your browser: ${url}`))
    .unref();
}
