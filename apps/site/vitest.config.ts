import { defineConfig } from "vitest/config";

// Unit tests for the website's logic (no browser): src/**/*.test.ts.
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"], setupFiles: ["src/test-setup.ts"] },
});
