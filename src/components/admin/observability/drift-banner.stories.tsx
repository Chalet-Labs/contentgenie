import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DriftBanner } from "@/components/admin/observability/drift-banner";
import type { DriftResult } from "@/lib/observability/resolution-metrics";

const rates = { auto: 0.72, disambig: 0.18, new: 0.1, total: 500 };

const meta: Meta<typeof DriftBanner> = {
  title: "Admin/Observability/DriftBanner",
  component: DriftBanner,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof DriftBanner>;

export const Ok: Story = {
  args: {
    result: {
      status: "ok",
      reason: "All metrics within healthy bounds",
      rates,
    } satisfies DriftResult,
  },
};

export const Warn: Story = {
  args: {
    result: {
      status: "warn",
      reason: "auto-match rate 0.52 below warn threshold 0.55",
      rates: { ...rates, auto: 0.52 },
    } satisfies DriftResult,
  },
};

export const Alert: Story = {
  args: {
    result: {
      status: "alert",
      reason: "auto-match rate 0.35 below alert floor 0.40",
      rates: { ...rates, auto: 0.35 },
    } satisfies DriftResult,
  },
};
