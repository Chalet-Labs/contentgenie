/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    css: false,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "storybook-static"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/app/api/**/*.ts",
        "src/app/actions/**/*.ts",
        "src/components/**/*.{ts,tsx}",
        "src/lib/**/*.ts",
      ],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.stories.{ts,tsx}",
        "src/test/setup.ts",
        "src/components/ui/**",
        "src/db/**",
      ],
      thresholds: {
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
