import { defineConfig } from "@trigger.dev/sdk";
import { esbuildPlugin } from "@trigger.dev/build/extensions";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { createRequire } from "node:module";
import type { Plugin } from "esbuild";

// Trigger.dev workers bundle with esbuild, which has no React Server Components
// alias for `server-only`. Without this stub, every `import "server-only";` in
// `src/lib/` would throw at module load inside Trigger tasks (the package's
// `index.js` is an unconditional `throw`). We resolve it to the package's own
// `empty.js` so Trigger workers behave the same way Next's RSC compiler does in
// the web app, while production client components still get the real throw.
const requireFromHere = createRequire(import.meta.url);
const serverOnlyStub: Plugin = {
  name: "server-only-stub",
  setup(build) {
    build.onResolve({ filter: /^server-only$/ }, () => ({
      path: requireFromHere.resolve("server-only/empty.js"),
    }));
  },
};

export default defineConfig({
  project: "proj_arewlssdrzkeowwtutuu",
  dirs: ["./src/trigger"],
  runtime: "node",
  logLevel: "info",
  maxDuration: 600, // Default ceiling (10 min); individual tasks override via `maxDuration` on the task definition.
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    extensions: [
      esbuildPlugin(serverOnlyStub),
      // Syncs secrets from Doppler for Dev environment only.
      // Prod env vars are set manually in the Trigger.dev dashboard
      // to avoid the Doppler token mapping issue that caused
      // summaries to be written to the wrong database.
      // This only runs when DOPPLER_TOKEN is present — remove it
      // from Trigger.dev Prod environment to disable sync there.
      syncEnvVars(async () => {
        const token = process.env.DOPPLER_TOKEN;
        if (!token) return [];

        const res = await fetch(
          "https://api.doppler.com/v3/configs/config/secrets/download?format=json",
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return [];

        const secrets: Record<string, string> = await res.json();
        return Object.entries(secrets).map(([name, value]) => ({
          name,
          value,
        }));
      }),
    ],
  },
});
