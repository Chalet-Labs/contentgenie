import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  TopicDigestListView,
  TopicDigestListLoading,
} from "@/components/dashboard/topic-digest-list";
import type { RecentTopicDigest } from "@/app/actions/topics";

// `<TopicDigestList>` itself is an async server component (calls
// `getRecentTopicDigests`). Stories render the pure-presentational
// `<TopicDigestListView>` with fixture data so all states are inspectable
// without needing a live DB. Loading uses the real shell skeleton.

const meta: Meta<typeof TopicDigestListView> = {
  title: "Dashboard/TopicDigestList",
  component: TopicDigestListView,
  parameters: { layout: "padded" },
};

export default meta;
type Story = StoryObj<typeof TopicDigestListView>;

const baseDigest = (
  overrides: Partial<RecentTopicDigest> = {},
): RecentTopicDigest => ({
  canonicalId: 1,
  label: "GDPR Update",
  kind: "regulation",
  episodeCount: 4,
  generatedAt: new Date("2026-05-08T10:00:00Z"),
  consensusPreview: "New EU privacy rules take effect this quarter.",
  ...overrides,
});

export const Populated: Story = {
  name: "Populated (5 rows)",
  render: () => (
    <TopicDigestListView
      digests={[
        baseDigest({
          canonicalId: 10,
          label: "GDPR Update",
          kind: "regulation",
          episodeCount: 4,
          consensusPreview: "New EU privacy rules take effect this quarter.",
        }),
        baseDigest({
          canonicalId: 20,
          label: "AI Act",
          kind: "regulation",
          episodeCount: 7,
          consensusPreview: "Framework converges on risk-tiered enforcement.",
        }),
        baseDigest({
          canonicalId: 30,
          label: "Claude 4.7 release",
          kind: "release",
          episodeCount: 3,
          consensusPreview: "Hosts agree the long-context gains are notable.",
        }),
        baseDigest({
          canonicalId: 40,
          label: "OpenAI / Microsoft renegotiation",
          kind: "deal",
          episodeCount: 5,
          consensusPreview:
            "Profit-share terms shifted; compute access tightened.",
        }),
        baseDigest({
          canonicalId: 50,
          label: "Attention is all you need (revisited)",
          kind: "concept",
          episodeCount: 6,
          consensusPreview:
            "Discussion centers on whether attention alone is sufficient at scale.",
        }),
      ]}
    />
  ),
};

export const SingleRow: Story = {
  name: "Single row",
  render: () => (
    <TopicDigestListView
      digests={[
        baseDigest({
          canonicalId: 5,
          label: "OpenAI Drama",
          kind: "incident",
          episodeCount: 1,
          consensusPreview:
            "Single panel covered this — angle still developing.",
        }),
      ]}
    />
  ),
};

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
