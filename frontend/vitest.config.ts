import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      all: true,
      include: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
      exclude: [
        // Test files themselves aren't production code to cover.
        "**/*.test.ts",
        "**/*.test.tsx",
        // Pure JSX shell: font + metadata wiring only, no conditional logic.
        "app/layout.tsx",
        // Static demo fixture data (arrays/objects), no branches to exercise.
        "lib/data/demo-seed.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      reporter: ["text", "html", "json-summary"],
    },
  },
});
