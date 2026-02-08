import type { StorybookConfig } from "@storybook/react-vite";
import path from "path";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(js|jsx|ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  viteFinal: async (config) => {
    config.resolve = config.resolve || {};
    // Use array format so specific aliases are checked before the general "@" prefix
    config.resolve.alias = [
      // Stub out server-only modules that break Storybook's browser build
      { find: "@clerk/nextjs/server", replacement: path.resolve(__dirname, "mocks/clerk-server.ts") },
      { find: "@/db/schema", replacement: path.resolve(__dirname, "mocks/db-schema.ts") },
      { find: "@/db", replacement: path.resolve(__dirname, "mocks/db.ts") },
      { find: "@/app/actions/library", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/subscriptions", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/collections", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/app/actions/dashboard", replacement: path.resolve(__dirname, "mocks/actions.ts") },
      { find: "@/lib/podcastindex", replacement: path.resolve(__dirname, "mocks/podcastindex.ts") },
      // General path alias — must come last
      { find: "@", replacement: path.resolve(__dirname, "../src") },
    ];
    return config;
  },
};

export default config;
