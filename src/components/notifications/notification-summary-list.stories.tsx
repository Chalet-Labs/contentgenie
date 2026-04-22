import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { NotificationSummaryList } from "@/components/notifications/notification-summary-list";
import type { NotificationSummary } from "@/app/actions/notifications";

const meta: Meta<typeof NotificationSummaryList> = {
  title: "Notifications/NotificationSummaryList",
  component: NotificationSummaryList,
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj<typeof NotificationSummaryList>;

const lastSeenAt = new Date("2026-04-20T10:00:00.000Z");

export const Empty: Story = {
  args: {
    summary: {
      totalUnread: 0,
      lastSeenAt: null,
      groups: [],
    } satisfies NotificationSummary,
  },
};

export const SingleGroup: Story = {
  args: {
    summary: {
      totalUnread: 3,
      lastSeenAt: null,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 1,
          podcastTitle: "The Daily",
          count: 3,
        },
      ],
    } satisfies NotificationSummary,
  },
};

export const MultipleGroups: Story = {
  args: {
    summary: {
      totalUnread: 9,
      lastSeenAt,
      groups: [
        { kind: "episodes_since_last_seen", count: 4 },
        {
          kind: "episodes_by_podcast",
          podcastId: 1,
          podcastTitle: "The Daily",
          count: 5,
        },
        {
          kind: "episodes_by_podcast",
          podcastId: 2,
          podcastTitle: "Hard Fork",
          count: 3,
        },
        {
          kind: "episodes_by_podcast",
          podcastId: 3,
          podcastTitle: "Lex Fridman Podcast",
          count: 1,
        },
      ],
    } satisfies NotificationSummary,
  },
};

export const SinceLastSeenOnly: Story = {
  args: {
    summary: {
      totalUnread: 4,
      lastSeenAt,
      groups: [{ kind: "episodes_since_last_seen", count: 4 }],
    } satisfies NotificationSummary,
  },
};

export const LongPodcastTitle: Story = {
  args: {
    summary: {
      totalUnread: 2,
      lastSeenAt: null,
      groups: [
        {
          kind: "episodes_by_podcast",
          podcastId: 99,
          podcastTitle:
            "This Is a Very Long Podcast Title That Tests How The Layout Handles Overflow In The List",
          count: 2,
        },
      ],
    } satisfies NotificationSummary,
  },
};
