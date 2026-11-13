import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests only (no DOM): the roster ordering is plain data in, data out.
 * Kept apart from `vite.config.ts` so `vite build` never loads the test runner.
 * `@/…` mirrors the browser alias; `@swiftslip/shared/*` resolves through the
 * workspace package's own exports map, no extra alias needed.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
