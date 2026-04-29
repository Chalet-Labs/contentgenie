import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicChip } from "@/components/episodes/topic-chip";

const meta: Meta<typeof TopicChip> = {
  title: "Topics/TopicChip",
  component: TopicChip,
  args: {
    canonicalTopicId: 42,
    label: "Claude Opus 4.7 release",
    kind: "release",
  },
};

export default meta;
type Story = StoryObj<typeof TopicChip>;

export const Release: Story = {
  args: { kind: "release", label: "Claude Opus 4.7 release" },
};

export const Announcement: Story = {
  args: { kind: "announcement", label: "Gemini 2.5 Pro announcement" },
};

export const Incident: Story = {
  args: { kind: "incident", label: "OpenAI API outage" },
};

export const Regulation: Story = {
  args: { kind: "regulation", label: "EU AI Act enforcement" },
};

export const Deal: Story = {
  args: { kind: "deal", label: "Microsoft–OpenAI partnership renewal" },
};

export const Event: Story = {
  args: { kind: "event", label: "NeurIPS 2025" },
};

export const Concept: Story = {
  args: { kind: "concept", label: "Attention mechanism" },
};

export const Work: Story = {
  args: { kind: "work", label: "Attention Is All You Need" },
};

export const Other: Story = {
  args: { kind: "other", label: "Miscellaneous topic" },
};

export const Dormant: Story = {
  args: {
    kind: "concept",
    label: "Deprecated concept",
    status: "dormant",
  },
};

export const LongLabel: Story = {
  args: {
    kind: "announcement",
    label:
      "Anthropic Claude Opus 4.7 extended thinking release announcement — with extremely verbose title that should truncate",
  },
};
