import type { Meta, StoryObj } from "@storybook/react";
import { NotificationList } from "@/components/notifications/notification-list";

const meta: Meta<typeof NotificationList> = {
  title: "Notifications/NotificationList",
  component: NotificationList,
  decorators: [
    (Story) => (
      <div className="w-80 border rounded-lg overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NotificationList>;

const now = new Date("2026-01-15T10:00:00Z");

export const Empty: Story = {
  args: {
    notifications: [],
  },
};

export const MixedTypes: Story = {
  args: {
    notifications: [
      {
        id: 1,
        type: "new_episode",
        title: "The Daily",
        body: "New episode: What's Next for AI Policy",
        isRead: false,
        createdAt: new Date(now.getTime() - 5 * 60 * 1000),
        episodeId: 101,
        episodeTitle: "What's Next for AI Policy",
        podcastTitle: "The Daily",
      },
      {
        id: 2,
        type: "summary_completed",
        title: "Lex Fridman Podcast",
        body: "Summary ready: Interview with Yann LeCun",
        isRead: false,
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        episodeId: 102,
        episodeTitle: "Interview with Yann LeCun",
        podcastTitle: "Lex Fridman Podcast",
      },
      {
        id: 3,
        type: "new_episode",
        title: "Huberman Lab",
        body: "New episode: Sleep Optimization",
        isRead: true,
        createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        episodeId: 103,
        episodeTitle: "Sleep Optimization",
        podcastTitle: "Huberman Lab",
      },
    ],
  },
};

export const AllRead: Story = {
  args: {
    notifications: [
      {
        id: 1,
        type: "summary_completed",
        title: "Podcast A",
        body: "Summary ready: Episode 1",
        isRead: true,
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        episodeId: 201,
        episodeTitle: "Episode 1",
        podcastTitle: "Podcast A",
      },
      {
        id: 2,
        type: "summary_completed",
        title: "Podcast B",
        body: "Summary ready: Episode 2",
        isRead: true,
        createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
        episodeId: 202,
        episodeTitle: "Episode 2",
        podcastTitle: "Podcast B",
      },
    ],
  },
};
