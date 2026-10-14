import { defineConfig } from "vitest/config";

// Unit tests for the website's logic (no browser): src/**/*.test.ts, and test/ for the server
// functions in api/ (kept out of api/, where every file becomes a function).
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts", "test/**/*.test.ts"], setupFiles: ["src/test-setup.ts"] },
});
