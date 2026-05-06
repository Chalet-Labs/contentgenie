import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CanonicalOverlapIndicator } from "./canonical-overlap-indicator";

const meta: Meta<typeof CanonicalOverlapIndicator> = {
  title: "Episodes/CanonicalOverlapIndicator",
  component: CanonicalOverlapIndicator,
};

export default meta;
type Story = StoryObj<typeof CanonicalOverlapIndicator>;

export const RepeatHigh: Story = {
  args: {
    overlap: { kind: "repeat", count: 5, topicLabel: "creatine", topicId: 1 },
  },
};

// count=1 intentionally renders "You've heard 1 episodes on X" — pluralization deferred to follow-up (v1 copy freeze).
export const RepeatSingleton: Story = {
  args: {
    overlap: {
      kind: "repeat",
      count: 1,
      topicLabel: "creatine",
      topicId: 1,
    },
  },
};

export const NewTopic: Story = {
  args: {
    overlap: { kind: "new", topicLabel: "OpenAI o4 preview", topicId: 2 },
  },
};
