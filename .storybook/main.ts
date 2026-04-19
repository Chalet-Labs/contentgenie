import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";
import path, { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-docs"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve || {};
    // Use array format so specific aliases are checked before the general "@" prefix
    config.resolve.alias = [
      // Storybook-mock alias so stories can import helpers without relative paths escaping src/
      { find: "@storybook-mocks", replacement: path.resolve(__dirname, "mocks") },
      // Stub out server-only and provider-dependent modules for Storybook's browser build
      { find: "@clerk/nextjs/server", replacement: path.resolve(__dirname, "mocks/clerk-server.ts") },
      { find: "@clerk/nextjs", replacement: path.resolve(__dirname, "mocks/clerk.ts") },
      { find: "@/db/schema", replacement: path.resolve(__dirname, "mocks/db-schema.ts") },
      { find: "@/db/helpers", replacement: path.resolve(__dirname, "mocks/db-helpers.ts") },
      { find: "@/db", replacement: path.resolve(__dirname, "mocks/db.ts") },
      { find: "@/app/actions/library", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/subscriptions", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/collections", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/dashboard", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/queue-scores", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@trigger.dev/react-hooks", replacement: path.resolve(__dirname, "mocks/trigger-react-hooks.ts") },
      { find: "@/lib/podcastindex", replacement: path.resolve(__dirname, "mocks/podcastindex.ts") },
      { find: "@/hooks/use-sync-queue", replacement: path.resolve(__dirname, "mocks/use-sync-queue.ts") },
      // General path alias — must come last
      { find: "@", replacement: path.resolve(__dirname, "../src") },
    ];
    return config;
  },
};

export default config;
