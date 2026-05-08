import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { MatchMethodTrendBars } from "@/components/admin/observability/match-method-trend-bars";
import type { MatchMethodTrendEntry } from "@/lib/observability/resolution-metrics";

function makeDay(
  daysAgo: number,
  auto: number,
  disambig: number,
  newCount: number,
): MatchMethodTrendEntry {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  d.setUTCHours(0, 0, 0, 0);
  return {
    bucket: d,
    auto,
    llm_disambig: disambig,
    new: newCount,
    total: auto + disambig + newCount,
  };
}

const sevenDays: MatchMethodTrendEntry[] = [
  makeDay(6, 120, 30, 10),
  makeDay(5, 95, 40, 15),
  makeDay(4, 200, 20, 5),
  makeDay(3, 80, 60, 20),
  makeDay(2, 150, 35, 12),
  makeDay(1, 110, 45, 8),
  makeDay(0, 180, 25, 14),
];

const meta: Meta<typeof MatchMethodTrendBars> = {
  title: "Admin/Observability/MatchMethodTrendBars",
  component: MatchMethodTrendBars,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof MatchMethodTrendBars>;

export const SevenDays: Story = {
  args: { entries: sevenDays },
};

export const SingleDay: Story = {
  args: { entries: [makeDay(0, 200, 40, 20)] },
};

export const AllNew: Story = {
  args: {
    entries: [makeDay(0, 0, 0, 50)],
  },
};

export const Empty: Story = {
  args: { entries: [] },
};
