import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  type AudioPlayerAPI,
  type AudioPlayerState,
} from "@/contexts/audio-player-context";
import { NotificationPageList } from "@/components/notifications/notification-page-list";
import {
  STORY_NOW,
  STORY_TWO_HOURS_AGO,
  STORY_THIRTY_MIN_AGO,
  STORY_THREE_DAYS_AGO,
} from "@/test/story-fixtures";

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

const emptyPlayerState: AudioPlayerState = {
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

const meta: Meta<typeof NotificationPageList> = {
  title: "Notifications/NotificationPageList",
  component: NotificationPageList,
  decorators: [
    (Story) => (
      <AudioPlayerAPIContext.Provider value={noopAPI}>
        <AudioPlayerStateContext.Provider value={emptyPlayerState}>
          <div className="max-w-2xl mx-auto p-4">
            <Story />
          </div>
        </AudioPlayerStateContext.Provider>
      </AudioPlayerAPIContext.Provider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NotificationPageList>;

function makeItem(
  id: number,
  overrides: Partial<React.ComponentProps<typeof NotificationPageList>["initialItems"][0]> = {}
) {
  return {
    id,
    type: "new_episode" as const,
    title: `New episode: Podcast ${id}`,
    body: `Episode body for notification ${id}`,
    isRead: false,
    createdAt: STORY_NOW,
    episodeDbId: id * 10,
    episodePodcastIndexId: `pi-${id}`,
    episodeTitle: `Episode ${id}`,
    podcastTitle: `Podcast ${id}`,
    worthItScore: null,
    audioUrl: "https://example.com/audio.mp3",
    artwork: null,
    duration: 1800,
    ...overrides,
  };
}

export const Empty: Story = {
  args: {
    initialItems: [],
    initialHasMore: false,
    initialTopicsByEpisode: {},
  },
};

export const MixedStates: Story = {
  args: {
    initialItems: [
      makeItem(1, { isRead: false, createdAt: STORY_THIRTY_MIN_AGO, worthItScore: "8.50" }),
      makeItem(2, { isRead: false, createdAt: STORY_TWO_HOURS_AGO, worthItScore: "5.20" }),
      makeItem(3, { isRead: false, createdAt: STORY_TWO_HOURS_AGO }),
      makeItem(4, { isRead: true, createdAt: STORY_THREE_DAYS_AGO, worthItScore: "3.00" }),
      makeItem(5, { isRead: true, createdAt: STORY_THREE_DAYS_AGO }),
      makeItem(6, { isRead: true, createdAt: STORY_THREE_DAYS_AGO }),
    ],
    initialHasMore: false,
    initialTopicsByEpisode: {
      10: ["AI", "Technology", "Future"],
      20: ["Politics", "Economics"],
      30: ["Health"],
    },
  },
};

export const AllRead: Story = {
  args: {
    initialItems: [
      makeItem(1, { isRead: true, createdAt: STORY_TWO_HOURS_AGO }),
      makeItem(2, { isRead: true, createdAt: STORY_THREE_DAYS_AGO }),
      makeItem(3, { isRead: true, createdAt: STORY_THREE_DAYS_AGO }),
    ],
    initialHasMore: false,
    initialTopicsByEpisode: {},
  },
};

export const AllUnread: Story = {
  args: {
    initialItems: [
      makeItem(1, { isRead: false, createdAt: STORY_THIRTY_MIN_AGO }),
      makeItem(2, { isRead: false, createdAt: STORY_TWO_HOURS_AGO }),
      makeItem(3, { isRead: false, createdAt: STORY_TWO_HOURS_AGO }),
    ],
    initialHasMore: false,
    initialTopicsByEpisode: {
      10: ["Science", "Biology"],
      20: ["Business"],
    },
  },
};

export const WithLoadMore: Story = {
  args: {
    initialItems: Array.from({ length: 5 }, (_, i) =>
      makeItem(i + 1, {
        isRead: i % 2 === 0,
        createdAt: STORY_TWO_HOURS_AGO,
        worthItScore: i % 3 === 0 ? "9.00" : null,
      })
    ),
    initialHasMore: true,
    initialTopicsByEpisode: {},
  },
};

export const WithHighWorthItScores: Story = {
  args: {
    initialItems: [
      makeItem(1, { isRead: false, worthItScore: "9.80", createdAt: STORY_THIRTY_MIN_AGO }),
      makeItem(2, { isRead: false, worthItScore: "7.50", createdAt: STORY_TWO_HOURS_AGO }),
      makeItem(3, { isRead: true, worthItScore: "4.00", createdAt: STORY_THREE_DAYS_AGO }),
      makeItem(4, { isRead: true, worthItScore: "1.50", createdAt: STORY_THREE_DAYS_AGO }),
      makeItem(5, { isRead: true, worthItScore: null, createdAt: STORY_THREE_DAYS_AGO }),
    ],
    initialHasMore: false,
    initialTopicsByEpisode: {
      10: ["AI", "Machine Learning", "Deep Learning"],
      20: ["Entrepreneurship", "Startups"],
      30: ["Health", "Fitness"],
    },
  },
};
