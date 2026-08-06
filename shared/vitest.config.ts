import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // shared/src/__e2e.test.ts is an untracked scratch file with no assertions that
    // pollutes local test runs. Sandbox `rm` was denied when trying to delete it
    // directly — please delete shared/src/__e2e.test.ts manually. This exclude is the
    // enforceable guard in the meantime.
    exclude: ["**/node_modules/**", "**/__e2e.test.ts", "**/__scratch_ek412.test.ts"],
  },
});
