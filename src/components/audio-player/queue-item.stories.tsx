import { asPodcastIndexEpisodeId } from "@/types/ids";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DndContext } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { AudioEpisode } from "@/contexts/audio-player-context";
import { QueueItem } from "@/components/audio-player/queue-item";

const testEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-1"),
  title: "How to Build Better Products",
  podcastTitle: "Design Matters",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://picsum.photos/seed/podcast/300/300",
  duration: 2400,
};

const longTitleEpisode: AudioEpisode = {
  id: asPodcastIndexEpisodeId("ep-2"),
  title:
    "The Extremely Long Episode Title That Should Be Truncated Because It Exceeds The Available Width",
  podcastTitle:
    "My Very Long Podcast Name That Also Needs Truncation In The Queue Item",
  audioUrl: "https://example.com/audio.mp3",
  duration: 5400,
};

function DndWrapper({ children }: { children: React.ReactNode }) {
  return (
    <DndContext>
      <SortableContext
        items={["ep-1", "ep-2"]}
        strategy={verticalListSortingStrategy}
      >
        <div className="w-80">{children}</div>
      </SortableContext>
    </DndContext>
  );
}

const meta: Meta<typeof QueueItem> = {
  title: "AudioPlayer/QueueItem",
  component: QueueItem,
  decorators: [
    (Story) => (
      <DndWrapper>
        <Story />
      </DndWrapper>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof QueueItem>;

export const Default: Story = {
  args: {
    episode: testEpisode,
    onRemove: () => {},
    onPlay: () => {},
  },
};

export const LongTitle: Story = {
  args: {
    episode: longTitleEpisode,
    onRemove: () => {},
    onPlay: () => {},
  },
};

export const Dragging: Story = {
  args: {
    episode: testEpisode,
    onRemove: () => {},
    onPlay: () => {},
  },
  // Note: useSortable's isDragging state is set by @dnd-kit internals and cannot be
  // easily forced via args. This story renders the item in its default (non-dragging)
  // state inside a DnD context so that the component mounts without errors.
  // Visual drag state can be confirmed via manual interaction in the Storybook canvas.
};
