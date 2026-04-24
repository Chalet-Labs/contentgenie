import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EpisodeList } from "./episode-list";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";

function makeEpisode(
  id: number,
  title: string,
  description: string,
): PodcastIndexEpisode {
  return {
    id,
    title,
    link: "https://example.com/episode",
    description,
    guid: `guid-${id}`,
    datePublished: 1705276800 - id * 86_400,
    datePublishedPretty: "January 15, 2024",
    dateCrawled: 1705276800,
    enclosureUrl: "https://example.com/audio.mp3",
    enclosureType: "audio/mpeg",
    enclosureLength: 50_000_000,
    duration: 2700,
    explicit: 0,
    episode: id,
    episodeType: "full",
    season: 1,
    image: "",
    feedItunesId: null,
    feedImage: "",
    feedId: 1,
    feedLanguage: "en",
    feedDead: 0,
    feedDuplicateOf: null,
    chaptersUrl: null,
    transcriptUrl: null,
    soundbite: null,
    soundbites: [],
    transcripts: [],
  };
}

const sampleEpisodes: PodcastIndexEpisode[] = [
  makeEpisode(
    1,
    "Intro to TypeScript",
    "Type systems for JavaScript developers.",
  ),
  makeEpisode(
    2,
    "Advanced React Patterns",
    "Compound components, hooks, and context.",
  ),
  makeEpisode(
    3,
    "Rust for JS devs",
    "Memory safety without garbage collection.",
  ),
  makeEpisode(
    4,
    "Building with Next.js App Router",
    "Server components and streaming.",
  ),
  makeEpisode(
    5,
    "Postgres at Scale",
    "Indexes, partitioning, and query plans.",
  ),
];

const meta: Meta<typeof EpisodeList> = {
  title: "Podcasts/EpisodeList",
  component: EpisodeList,
};

export default meta;
type Story = StoryObj<typeof EpisodeList>;

export const Default: Story = {
  args: { episodes: sampleEpisodes },
};

export const Loading: Story = {
  args: { episodes: [], isLoading: true },
};

export const Error: Story = {
  args: { episodes: [], error: "Could not load episodes." },
};

export const Empty: Story = {
  args: { episodes: [] },
};

export const SingleEpisode: Story = {
  args: { episodes: [sampleEpisodes[0]] },
};
