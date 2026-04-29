import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EpisodeCard } from "./episode-card";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";
import { withAudioPlayerContext } from "@/test/story-fixtures";

const baseEpisode: PodcastIndexEpisode = {
  id: 789,
  title: "How AI is Transforming Podcast Discovery",
  link: "https://example.com/episode",
  description:
    "In this episode, we explore how artificial intelligence is changing the way people find and consume podcasts.",
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
  decorators: [withAudioPlayerContext],
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

export const Processing: Story = {
  args: {
    episode: baseEpisode,
    summaryStatus: "running",
  },
};

export const Failed: Story = {
  args: {
    episode: baseEpisode,
    summaryStatus: "failed",
  },
};

export const NoSummaryData: Story = {
  args: {
    episode: baseEpisode,
  },
};

export const Unlistened: Story = {
  args: {
    episode: baseEpisode,
    isListened: false,
  },
};

export const Listened: Story = {
  args: {
    episode: baseEpisode,
    isListened: true,
  },
};

export const WithQueueAction: Story = {
  args: {
    episode: { ...baseEpisode, feedTitle: "Tech Talk Daily" },
    showQueueAction: true,
  },
};

export const WithTopics: Story = {
  args: {
    episode: { ...baseEpisode, feedTitle: "Tech Talk Daily" },
    summaryStatus: "completed",
    worthItScore: "7.80",
    topics: ["AI", "Developer Tools", "Startups"],
  },
};

export const WithCanonicalTopics: Story = {
  args: {
    episode: { ...baseEpisode, feedTitle: "Tech Talk Daily" },
    summaryStatus: "completed",
    worthItScore: "8.10",
    canonicalTopics: [
      { id: 1, label: "Claude Opus 4.7 release", kind: "release" },
      { id: 2, label: "OpenAI API outage", kind: "incident" },
      { id: 3, label: "EU AI Act", kind: "regulation" },
    ],
  },
};
