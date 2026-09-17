import { defineConfig } from "vitest/config";

// Coverage target: the pure-logic modules under supabase/functions/_shared
// only. The Deno `index.ts` wiring files per Edge Function are intentionally
// excluded — they are thin `serve()` handlers that read `Deno.env` and call
// into the pure logic modules; they cannot run under Node/Vitest at all
// (no `Deno` global, ESM `https://` imports). See backend/README.md for the
// full rationale.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      all: true,
      include: ["supabase/functions/_shared/**/*.ts"],
      exclude: [
        "supabase/functions/_shared/**/types.ts",
      ],
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
