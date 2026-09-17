import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// `React.cache()` (used by `lib/auth/fleet-context.ts` to dedupe a Server
// Component's Supabase lookups within one request) only exists on the
// "react-server" build of the `react` package. Next.js's own bundler
// (webpack, via `next build`/`next dev`) selects that build automatically
// for the Server Components module graph, so `cache()` is real there and
// backed by Next's per-request AsyncLocalStorage. Vitest runs on Vite, which
// has no such condition and resolves plain `react` — where `cache` is
// `undefined` — so every module that calls `cache(fn)` at import time would
// throw under test. This shim supplies an identity fallback (call straight
// through, no memoization) so those modules import cleanly; the actual
// request-scoped caching behavior is Next.js/React framework machinery, not
// app logic, and isn't something this project's tests exercise.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const realCache = (actual as { cache?: <T>(fn: T) => T }).cache;
  return {
    ...actual,
    cache: realCache ?? (<T extends (...args: never[]) => unknown>(fn: T): T => fn),
  };
});
