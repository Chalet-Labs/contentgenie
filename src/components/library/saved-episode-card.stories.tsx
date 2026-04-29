import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SavedEpisodeCard } from "@/components/library/saved-episode-card";
import type { SavedItemDTO } from "@/db/library-columns";
import { asPodcastIndexEpisodeId } from "@/types/ids";
import { withAudioPlayerContext } from "@/test/story-fixtures";

const podcastIndexId = asPodcastIndexEpisodeId("PI-789");

const baseItem: SavedItemDTO = {
  id: 1,
  userId: "user_demo",
  episodeId: 789,
  savedAt: new Date("2024-01-15"),
  notes: null,
  rating: null,
  collectionId: null,
  episode: {
    id: 789,
    podcastIndexId,
    title: "How AI is Transforming Podcast Discovery",
    description:
      "In this episode, we explore how artificial intelligence is changing the way people find and consume podcasts.",
    audioUrl: "https://example.com/audio.mp3",
    duration: 2700,
    publishDate: new Date("2024-01-01"),
    worthItScore: null,
    podcast: {
      id: 10,
      podcastIndexId: "PC-10",
      title: "Tech Talk Daily",
      imageUrl: "https://picsum.photos/seed/podcast/80/80",
    },
  },
};

const meta: Meta<typeof SavedEpisodeCard> = {
  title: "Library/SavedEpisodeCard",
  component: SavedEpisodeCard,
  decorators: [withAudioPlayerContext],
};

export default meta;
type Story = StoryObj<typeof SavedEpisodeCard>;

export const Default: Story = {
  args: { item: baseItem },
};

export const WithCanonicalTopics: Story = {
  args: {
    item: {
      ...baseItem,
      episode: {
        ...baseItem.episode,
        canonicalTopics: [
          { id: 1, label: "Claude Opus 4.7 release", kind: "release" },
          { id: 2, label: "OpenAI API outage", kind: "incident" },
          { id: 3, label: "EU AI Act", kind: "regulation" },
        ],
      },
    },
  },
};

export const WithRatingAndNotes: Story = {
  args: {
    item: {
      ...baseItem,
      rating: 4,
      notes: "Really insightful episode — worth revisiting.",
    },
  },
};
