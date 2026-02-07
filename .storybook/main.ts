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
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "../src"),
      // Stub out server-only modules that break Storybook's browser build
      "@clerk/nextjs/server": path.resolve(__dirname, "mocks/clerk-server.ts"),
      "@/db": path.resolve(__dirname, "mocks/db.ts"),
      "@/db/schema": path.resolve(__dirname, "mocks/db-schema.ts"),
      "@/app/actions/library": path.resolve(__dirname, "mocks/actions.ts"),
      "@/app/actions/subscriptions": path.resolve(
        __dirname,
        "mocks/actions.ts"
      ),
      "@/app/actions/collections": path.resolve(
        __dirname,
        "mocks/actions.ts"
      ),
      "@/app/actions/dashboard": path.resolve(__dirname, "mocks/actions.ts"),
    };
    return config;
  },
};

export default config;
