import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TranscriptSourceCard } from "@/components/admin/overview/transcript-source-card";
import type { TranscriptSourceBreakdown } from "@/lib/admin/overview-queries";

const meta: Meta<typeof TranscriptSourceCard> = {
  title: "Admin/Overview/TranscriptSourceCard",
  component: TranscriptSourceCard,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TranscriptSourceCard>;

export const Empty: Story = {
  args: {
    breakdown: [] satisfies TranscriptSourceBreakdown[],
  },
};

export const Mixed: Story = {
  args: {
    breakdown: [
      { source: "podcastindex", count: 30 },
      { source: "assemblyai", count: 20 },
      { source: "description-url", count: 10 },
    ] satisfies TranscriptSourceBreakdown[],
  },
};

export const WithPodcastSite: Story = {
  args: {
    breakdown: [
      { source: "podcastindex", count: 30 },
      { source: "assemblyai", count: 20 },
      { source: "description-url", count: 10 },
      { source: "podcast-site", count: 8 },
      { source: null, count: 2 },
    ] satisfies TranscriptSourceBreakdown[],
  },
};
