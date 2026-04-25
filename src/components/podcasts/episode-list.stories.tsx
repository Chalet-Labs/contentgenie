import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  AudioPlayerAPIContext,
  AudioPlayerProgressContext,
  AudioPlayerStateContext,
  type AudioPlayerAPI,
  type AudioPlayerProgress,
  type AudioPlayerState,
} from "@/contexts/audio-player-context";
import { EpisodeList } from "./episode-list";
import type { PodcastIndexEpisode } from "@/lib/podcastindex";

// EpisodeList renders EpisodeCard rows whose action buttons (PlayEpisodeButton,
// AddToQueueButton, ListenedButton) call useAudioPlayerAPI/State at module
// mount. Without these contexts the story throws on render. Stub with a
// minimal noop API + idle state so the visual surface renders without wiring
// up the full AudioPlayerProvider (which pulls in audio elements, queue
// persistence, etc.).
const noopAudioPlayerAPI: AudioPlayerAPI = {
  playEpisode: () => {},
  togglePlay: () => {},
  seek: () => {},
  skipForward: () => {},
  skipBack: () => {},
  setVolume: () => {},
  setPlaybackSpeed: () => {},
  closePlayer: () => {},
  addToQueue: () => {},
  removeFromQueue: () => {},
  reorderQueue: () => {},
  clearQueue: () => {},
  playNext: () => {},
  setSleepTimer: () => {},
  cancelSleepTimer: () => {},
  getCurrentTime: () => 0,
};

const idleAudioPlayerState: AudioPlayerState = {
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  queue: [],
  chapters: null,
  chaptersLoading: false,
  sleepTimer: null,
};

const idleAudioPlayerProgress: AudioPlayerProgress = {
  currentTime: 0,
  buffered: 0,
};

const withAudioPlayerContext: Decorator = (Story) => (
  <AudioPlayerAPIContext.Provider value={noopAudioPlayerAPI}>
    <AudioPlayerStateContext.Provider value={idleAudioPlayerState}>
      <AudioPlayerProgressContext.Provider value={idleAudioPlayerProgress}>
        <Story />
      </AudioPlayerProgressContext.Provider>
    </AudioPlayerStateContext.Provider>
  </AudioPlayerAPIContext.Provider>
);

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
  decorators: [withAudioPlayerContext],
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
