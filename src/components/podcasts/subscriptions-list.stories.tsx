import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SubscriptionsList } from "./subscriptions-list";
import type { SubscriptionWithPodcast } from "@/app/actions/subscriptions";

const makeSub = (
  id: number,
  overrides: Partial<SubscriptionWithPodcast> = {},
): SubscriptionWithPodcast => ({
  id,
  userId: "user_demo",
  podcastId: id,
  subscribedAt: new Date("2026-01-15"),
  notificationsEnabled: true,
  isPinned: false,
  podcast: {
    id,
    podcastIndexId: String(10_000 + id),
    title: `Podcast ${id}`,
    publisher: "Example Publisher",
    imageUrl: `https://picsum.photos/seed/sub-${id}/300/300`,
    rssFeedUrl: "https://example.com/feed.xml",
    categories: ["Technology", "Business"],
    totalEpisodes: 42,
    latestEpisodeDate: new Date("2026-02-10"),
    source: "podcastindex",
    lastPolledAt: null,
    createdAt: new Date("2025-06-01"),
    updatedAt: new Date("2026-02-10"),
  },
  ...overrides,
});

const meta: Meta<typeof SubscriptionsList> = {
  title: "Podcasts/SubscriptionsList",
  component: SubscriptionsList,
};

export default meta;
type Story = StoryObj<typeof SubscriptionsList>;

export const Default: Story = {
  args: {
    initialSort: "recently-added",
    subscriptions: [
      makeSub(1, { isPinned: true, podcast: { ...makeSub(1).podcast, title: "Pinned Podcast" } }),
      makeSub(2),
      makeSub(3),
    ],
  },
};

export const MidSort: Story = {
  args: {
    initialSort: "title-asc",
    subscriptions: [
      makeSub(1, { podcast: { ...makeSub(1).podcast, title: "Alpha Show" } }),
      makeSub(2, { podcast: { ...makeSub(2).podcast, title: "Beta Briefing" } }),
      makeSub(3, { podcast: { ...makeSub(3).podcast, title: "Gamma Glance" } }),
    ],
  },
};

export const AllPinned: Story = {
  args: {
    initialSort: "recently-added",
    subscriptions: [
      makeSub(1, { isPinned: true }),
      makeSub(2, { isPinned: true }),
      makeSub(3, { isPinned: true }),
    ],
  },
};
