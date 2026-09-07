import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `__`-prefixed test files are scratch by convention — one-off probes with no assertions
    // that otherwise pollute the run. This used to name two of them individually
    // (`__e2e.test.ts`, `__scratch_ek412.test.ts`) and ask, in a comment, for them to be deleted
    // by hand. Both were gone by 2026-09-07, so the exclude was guarding nothing and the comment
    // was requesting work already done. The pattern keeps the guard without the expiry.
    exclude: ["**/node_modules/**", "**/__*.test.ts"],
  },
});
