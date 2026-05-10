import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TopicDigestListLoading } from "@/components/dashboard/topic-digest-list";

// ---------------------------------------------------------------------------
// Note: TopicDigestList is an async server component that fetches live data.
// Stories here cover the loading skeleton and document the empty/error states.
// For the populated/single-row stories, we render the loading skeleton as a
// shape proxy — the real component is verified via browser testing (T12).
// ---------------------------------------------------------------------------

const meta: Meta<typeof TopicDigestListLoading> = {
  title: "Dashboard/TopicDigestList",
  component: TopicDigestListLoading,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof TopicDigestListLoading>;

export const Loading: Story = {
  name: "Loading skeleton",
  render: () => <TopicDigestListLoading />,
};

export const EmptyState: Story = {
  name: "Empty state (null render)",
  render: () => (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      When there are no recent digests (last 7d), TopicDigestList returns null
      and nothing renders here. This story documents that expected behavior.
    </div>
  ),
};

export const ErrorState: Story = {
  name: "Error state (null render)",
  render: () => (
    <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      When getRecentTopicDigests returns success:false, TopicDigestList returns
      null and logs to console.error. This story documents that expected
      behavior.
    </div>
  ),
};
