import type { Meta, StoryObj } from "@storybook/react";
import { EpisodeCard } from "./episode-card";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";

const baseEpisode: PodcastIndexEpisode = {
  id: 789,
  title: "How AI is Transforming Podcast Discovery",
  link: "https://example.com/episode",
  description: "In this episode, we explore how artificial intelligence is changing the way people find and consume podcasts.",
  guid: "ep-guid-789",
  datePublished: 1705276800,
  datePublishedPretty: "January 15, 2024",
  dateCrawled: 1705276800,
  enclosureUrl: "https://example.com/audio.mp3",
  enclosureType: "audio/mpeg",
  enclosureLength: 50000000,
  duration: 2700,
  explicit: 0,
  episode: 42,
  episodeType: "full",
  season: 3,
  image: "",
  feedItunesId: null,
  feedImage: "",
  feedId: 456,
  feedLanguage: "en",
  feedDead: 0,
  feedDuplicateOf: null,
  chaptersUrl: null,
  transcriptUrl: null,
  soundbite: null,
  soundbites: [],
  transcripts: [],
};

const meta: Meta<typeof EpisodeCard> = {
  title: "Podcasts/EpisodeCard",
  component: EpisodeCard,
};

export default meta;
type Story = StoryObj<typeof EpisodeCard>;

export const Default: Story = {
  args: { episode: baseEpisode },
};

export const Trailer: Story = {
  args: {
    episode: { ...baseEpisode, episodeType: "trailer", duration: 120 },
  },
};

export const LongDuration: Story = {
  args: {
    episode: { ...baseEpisode, duration: 7200 },
  },
};

export const NoEpisodeNumber: Story = {
  args: {
    episode: { ...baseEpisode, episode: null, season: 0 },
  },
};

export const SummarizedHighScore: Story = {
  args: {
    episode: baseEpisode,
    summaryStatus: "completed",
    worthItScore: "9.20",
  },
};

export const SummarizedMediumScore: Story = {
  args: {
    episode: baseEpisode,
    summaryStatus: "completed",
    worthItScore: "6.50",
  },
};

export const SummarizedLowScore: Story = {
  args: {
    episode: baseEpisode,
    summaryStatus: "completed",
    worthItScore: "3.00",
  },
};

export const NoSummaryData: Story = {
  args: {
    episode: baseEpisode,
  },
};
