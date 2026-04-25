import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import { CheckCircle, Sparkles } from "lucide-react";
import {
  EpisodeTabs,
  EpisodeTabsContent,
  EpisodeTabsList,
  EpisodeTabsTrigger,
} from "@/components/episodes/episode-tabs";
import { EpisodeChaptersList } from "@/components/episodes/episode-chapters-list";
import {
  AudioPlayerAPIContext,
  AudioPlayerProgressContext,
  AudioPlayerStateContext,
  type AudioEpisode,
  type AudioPlayerAPI,
  type AudioPlayerState,
} from "@/contexts/audio-player-context";
import type { Chapter } from "@/lib/chapters";

const meta: Meta<typeof EpisodeTabs> = {
  title: "Episodes/EpisodeTabs",
  component: EpisodeTabs,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EpisodeTabs>;

function InsightsPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">AI-Powered Insights</h2>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-[hsl(var(--status-success-bg))] text-xl font-bold tabular-nums text-[hsl(var(--status-success-text))]">
            7.2
          </div>
          <div>
            <div className="font-semibold">Above average</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Strong specific interview tactics; second half drags into anecdote
              territory.
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Key takeaways</h3>
        </div>
        <ol className="mt-3 space-y-3 text-sm">
          <li>
            Frameworks are training wheels — high-judgment teams discard them.
          </li>
          <li>Interview for taste by asking what work they&apos;d redo.</li>
          <li>
            Onboarding into taste = exposure + critique, not documentation.
          </li>
        </ol>
      </div>
    </div>
  );
}

const sampleAudioEpisode: AudioEpisode = {
  id: "story-ep",
  title: "Why Senior Designers Stop Using Frameworks",
  podcastTitle: "Design Decisions",
  audioUrl: "https://example.com/audio.mp3",
};

const sampleChapters: Chapter[] = [
  { startTime: 0, title: "Cold open & intros" },
  { startTime: 312, title: "The trap of over-frameworking" },
  { startTime: 934, title: "Taste as a team asset" },
  { startTime: 1820, title: "Hiring for judgment" },
  { startTime: 2650, title: "Listener questions" },
  { startTime: 3400, title: "Wrap + next week" },
];

const noopAPI: AudioPlayerAPI = {
  playEpisode: () => {},
  togglePlay: () => {},
  seek: () => {},
  skipForward: () => {},
  skipBack: () => {},
  getCurrentTime: () => 0,
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
};

const playingState: AudioPlayerState = {
  currentEpisode: sampleAudioEpisode,
  isPlaying: true,
  isBuffering: false,
  isVisible: true,
  duration: 3600,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
  queue: [],
  chapters: sampleChapters,
  chaptersLoading: false,
  sleepTimer: null,
};

function MockAudioPlayer({ children }: { children: ReactNode }) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={playingState}>
        <AudioPlayerProgressContext.Provider
          value={{ currentTime: 400, buffered: 0 }}
        >
          {children}
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  );
}

function ChaptersPanel() {
  return (
    <MockAudioPlayer>
      <div className="rounded-lg border border-border bg-card p-4">
        <EpisodeChaptersList
          state={{ status: "ready", chapters: sampleChapters }}
          audioEpisode={sampleAudioEpisode}
        />
      </div>
    </MockAudioPlayer>
  );
}

function AboutPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-3 text-lg font-semibold">About This Episode</h2>
      <p className="text-sm text-muted-foreground">
        Debbie and guest Julie Zhuo unpack why senior designers stop reaching
        for frameworks and start trusting the room. Topics: the Jobs-to-be-Done
        trap, taste as a hireable skill, and how to onboard someone into your
        team&apos;s aesthetic without giving them a checklist.
      </p>
    </div>
  );
}

function renderEpisodeTabs({
  defaultValue,
  hasChapters,
}: {
  defaultValue: "insights" | "chapters" | "about";
  hasChapters: boolean;
}) {
  return (
    <EpisodeTabs defaultValue={defaultValue}>
      <EpisodeTabsList aria-label="Episode sections">
        <EpisodeTabsTrigger value="insights">Insights</EpisodeTabsTrigger>
        {hasChapters && (
          <EpisodeTabsTrigger value="chapters" badge={6}>
            Chapters
          </EpisodeTabsTrigger>
        )}
        <EpisodeTabsTrigger value="about">About</EpisodeTabsTrigger>
      </EpisodeTabsList>
      <EpisodeTabsContent value="insights">
        <InsightsPanel />
      </EpisodeTabsContent>
      {hasChapters && (
        <EpisodeTabsContent value="chapters">
          <ChaptersPanel />
        </EpisodeTabsContent>
      )}
      <EpisodeTabsContent value="about">
        <AboutPanel />
      </EpisodeTabsContent>
    </EpisodeTabs>
  );
}

export const Default: Story = {
  render: () =>
    renderEpisodeTabs({ defaultValue: "insights", hasChapters: true }),
};

export const NoChapters: Story = {
  name: "No Chapters (two-tab variant)",
  render: () =>
    renderEpisodeTabs({ defaultValue: "insights", hasChapters: false }),
};

export const ChaptersActive: Story = {
  name: "Chapters Tab Active",
  render: () =>
    renderEpisodeTabs({ defaultValue: "chapters", hasChapters: true }),
};
