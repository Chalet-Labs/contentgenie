import type { Meta, StoryObj } from "@storybook/react";
import { SubscriptionCard } from "./subscription-card";
import type { Podcast } from "@/db/schema";

const basePodcast: Podcast = {
  id: 1,
  podcastIndexId: "12345",
  title: "The Daily Tech Briefing",
  description: "A daily podcast covering the latest in technology, startups, and innovation.",
  publisher: "Jane Smith",
  imageUrl: "https://picsum.photos/seed/podcast1/300/300",
  rssFeedUrl: "https://example.com/feed.xml",
  categories: ["Technology", "Business", "News"],
  totalEpisodes: 156,
  latestEpisodeDate: new Date("2026-02-10"),
  source: "podcastindex",
  lastPolledAt: null,
  createdAt: new Date("2025-06-01"),
  updatedAt: new Date("2026-02-10"),
};

const meta: Meta<typeof SubscriptionCard> = {
  title: "Podcasts/SubscriptionCard",
  component: SubscriptionCard,
};

export default meta;
type Story = StoryObj<typeof SubscriptionCard>;

export const Default: Story = {
  args: {
    podcast: basePodcast,
    subscribedAt: new Date("2026-01-15"),
  },
};

export const NoImage: Story = {
  args: {
    podcast: { ...basePodcast, imageUrl: null },
    subscribedAt: new Date("2026-01-15"),
  },
};

export const ManyCategories: Story = {
  args: {
    podcast: {
      ...basePodcast,
      categories: ["Technology", "Science", "Education", "Business", "Health"],
    },
    subscribedAt: new Date("2026-01-15"),
  },
};

export const LongTitle: Story = {
  args: {
    podcast: {
      ...basePodcast,
      title:
        "This Is an Extremely Long Podcast Title That Should Test How the Card Handles Text Overflow and Wrapping Behavior",
    },
    subscribedAt: new Date("2026-01-15"),
  },
};
