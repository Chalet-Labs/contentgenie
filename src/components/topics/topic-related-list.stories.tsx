import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicRelatedList } from "@/components/topics/topic-related-list";
import type { RelatedTopic } from "@/app/actions/topics";

const meta: Meta<typeof TopicRelatedList> = {
  title: "Topics/TopicRelatedList",
  component: TopicRelatedList,
};

export default meta;
type Story = StoryObj<typeof TopicRelatedList>;

const sample: RelatedTopic[] = [
  { id: 1, label: "Claude Sonnet 4.6", kind: "release" },
  { id: 2, label: "Constitutional AI", kind: "concept" },
  { id: 3, label: "Anthropic", kind: "other" },
  {
    id: 4,
    label: "AI Safety Summit 2026",
    kind: "event",
  },
  {
    id: 5,
    label: "EU AI Act enforcement",
    kind: "regulation",
  },
];

export const WithFive: Story = {
  args: { items: sample },
};

export const WithFewer: Story = {
  args: { items: sample.slice(0, 2) },
};

export const Empty: Story = {
  args: { items: [] },
};
