import type { Meta, StoryObj } from "@storybook/react";
import { PodcastCard } from "./podcast-card";
import type { PodcastIndexPodcast } from "@/lib/podcastindex";

const basePodcast: PodcastIndexPodcast = {
  id: 123,
  podcastGuid: "guid-123",
  title: "The Daily Tech Briefing",
  url: "https://example.com/feed",
  originalUrl: "https://example.com/feed",
  link: "https://example.com",
  description: "A daily podcast covering the latest in technology, startups, and innovation.",
  author: "Jane Smith",
  ownerName: "Jane Smith",
  image: "",
  artwork: "https://picsum.photos/seed/podcast1/300/300",
  lastUpdateTime: 1700000000,
  lastCrawlTime: 1700000000,
  lastParseTime: 1700000000,
  lastGoodHttpStatusTime: 1700000000,
  lastHttpStatus: 200,
  contentType: "application/xml",
  itunesId: null,
  itunesType: "episodic",
  generator: "",
  language: "en",
  explicit: false,
  type: 0,
  medium: "podcast",
  dead: 0,
  episodeCount: 156,
  crawlErrors: 0,
  parseErrors: 0,
  categories: { "1": "Technology", "2": "Business", "3": "News" },
  locked: 0,
  imageUrlHash: 0,
  newestItemPubdate: 1700000000,
};

const meta: Meta<typeof PodcastCard> = {
  title: "Podcasts/PodcastCard",
  component: PodcastCard,
};

export default meta;
type Story = StoryObj<typeof PodcastCard>;

export const Default: Story = {
  args: { podcast: basePodcast },
};

export const NoImage: Story = {
  args: {
    podcast: { ...basePodcast, artwork: "", image: "" },
  },
};

export const LongDescription: Story = {
  args: {
    podcast: {
      ...basePodcast,
      description:
        "This is a very long description that goes on and on to test how the card handles text overflow. ".repeat(5),
    },
  },
};

export const ManyCategories: Story = {
  args: {
    podcast: {
      ...basePodcast,
      categories: {
        "1": "Technology",
        "2": "Science",
        "3": "Education",
        "4": "Business",
        "5": "Health",
      },
    },
  },
};
