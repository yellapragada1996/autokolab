import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The web view shares the AutoKolab client with the CLI, MCP server and runner.
const core = fileURLToPath(new URL("../../packages/autokolab/src/core", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@core": core } },
  server: { fs: { allow: [fileURLToPath(new URL("../..", import.meta.url))] } },
});
