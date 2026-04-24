// Left-accent bar is driven by isListened: unlistened → bar; listened → no bar (see ADR-038). VRT baselines must be regenerated after any change here.
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EpisodeCard } from "./episode-card";
import { ListenedButton } from "./listened-button";
import { AddToQueueButton } from "@/components/audio-player/add-to-queue-button";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context";
import { STORY_TWO_HOURS_AGO } from "@/test/story-fixtures";
import { formatRelativeTime } from "@/lib/utils";

const noopAPI: AudioPlayerAPI = {
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

const mockPlayerState: AudioPlayerState = {
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

function withAudioPlayer(Story: React.ComponentType) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={mockPlayerState}>
        <AudioPlayerProgressContext.Provider value={{ currentTime: 0, buffered: 0 }}>
          <Story />
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  );
}

const baseAudioEpisode = {
  id: "PI-42",
  title: "How AI is Transforming Podcast Discovery",
  podcastTitle: "Tech Talk Daily",
  audioUrl: "https://example.com/audio.mp3",
  duration: 2700,
};

const baseMeta = [
  <span key="time">{formatRelativeTime(STORY_TWO_HOURS_AGO)}</span>,
];

const meta: Meta<typeof EpisodeCard> = {
  title: "Episodes/EpisodeCard",
  component: EpisodeCard,
  args: {
    podcastTitle: "Tech Talk Daily",
    title: "How AI is Transforming Podcast Discovery",
    href: "/episode/PI-42",
    description:
      "In this episode, we explore how artificial intelligence is changing the way people find and consume podcasts, from recommendation engines to automated transcription.",
    meta: baseMeta,
  },
};

export default meta;
type Story = StoryObj<typeof EpisodeCard>;

export const NoArtwork: Story = {};

export const WithArtwork: Story = {
  args: {
    artwork: "https://picsum.photos/seed/podcast/80/80",
  },
};

export const ArtworkFallback: Story = {
  args: {
    artwork: null,
  },
};

export const UnreadAccent: Story = {
  args: {
    artwork: "https://picsum.photos/seed/podcast/80/80",
    accent: "unread",
  },
};

export const WithPrimaryAction: Story = {
  args: {
    artwork: "https://picsum.photos/seed/podcast/80/80",
    accent: "unread",
    primaryAction: <Button size="sm">Listen</Button>,
    secondaryActions: (
      <>
        <AddToQueueButton episode={baseAudioEpisode} variant="icon" />
        <Button variant="ghost" size="icon" aria-label="Dismiss">
          <X className="h-4 w-4" />
        </Button>
      </>
    ),
  },
  decorators: [withAudioPlayer],
};

export const ScoredExceptional: Story = {
  args: { score: "9.20" },
};

export const ScoredAverage: Story = {
  args: { score: "5.50" },
};

export const ScoredSkip: Story = {
  args: { score: "1.50" },
};

export const Unrated: Story = {
  args: { score: undefined },
};

export const ProcessingQueued: Story = {
  args: { status: "queued" },
};

export const ProcessingFailed: Story = {
  args: { status: "failed" },
};

// VRT contract: this story must render with a brand-colored left bar.
export const Unlistened: Story = {
  args: {
    isListened: false,
    secondaryActions: (
      <ListenedButton podcastIndexEpisodeId="PI-42" isListened={false} />
    ),
  },
};

// VRT contract: this story must render with no left bar.
export const Listened: Story = {
  args: {
    isListened: true,
    secondaryActions: (
      <ListenedButton podcastIndexEpisodeId="PI-42" isListened={true} />
    ),
  },
};

export const LongTitle: Story = {
  args: {
    title:
      "This Is An Extremely Long Episode Title That Goes On And On And Will Definitely Overflow Multiple Lines Without Clamping Behavior Applied",
  },
};

export const WithTopics: Story = {
  args: {
    topics: ["AI", "Machine Learning", "Podcast Tech", "Extra Topic"],
  },
};
