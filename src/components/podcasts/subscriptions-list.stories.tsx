import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SubscriptionsList } from "./subscriptions-list";
import type { SubscriptionWithPodcast } from "@/app/actions/subscriptions";

const makePodcast = (id: number, title = `Podcast ${id}`) => ({
  id,
  podcastIndexId: String(10_000 + id),
  title,
  publisher: "Example Publisher",
  imageUrl: `https://picsum.photos/seed/sub-${id}/300/300`,
  rssFeedUrl: "https://example.com/feed.xml",
  categories: ["Technology", "Business"],
  totalEpisodes: 42,
  latestEpisodeDate: new Date("2026-02-10"),
  source: "podcastindex" as const,
  lastPolledAt: null,
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2026-02-10"),
});

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
  podcast: makePodcast(id),
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
      makeSub(1, { isPinned: true, podcast: makePodcast(1, "Pinned Podcast") }),
      makeSub(2),
      makeSub(3),
    ],
  },
};

export const MidSort: Story = {
  args: {
    initialSort: "title-asc",
    subscriptions: [
      makeSub(1, { podcast: makePodcast(1, "Alpha Show") }),
      makeSub(2, { podcast: makePodcast(2, "Beta Briefing") }),
      makeSub(3, { podcast: makePodcast(3, "Gamma Glance") }),
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
