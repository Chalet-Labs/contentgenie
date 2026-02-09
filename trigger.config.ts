import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

export default defineConfig({
  project: "proj_arewlssdrzkeowwtutuu",
  dirs: ["./src/trigger"],
  runtime: "node",
  logLevel: "info",
  maxDuration: 300, // 5 minutes max per task run
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
      syncEnvVars(async () => {
        const token = process.env.DOPPLER_TOKEN;
        if (!token) return [];

        const res = await fetch(
          "https://api.doppler.com/v3/configs/config/secrets/download?format=json",
          { headers: { Authorization: `Bearer ${token}` } }
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
