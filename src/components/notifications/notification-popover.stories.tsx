import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/button";
import { NotificationPopover } from "@/components/notifications/notification-popover";
import type { NotificationSummary } from "@/app/actions/notifications";

const meta: Meta<typeof NotificationPopover> = {
  title: "Notifications/NotificationPopover",
  component: NotificationPopover,
  parameters: {
    layout: "centered",
  },
  args: {
    open: true,
    onOpenChange: () => {},
    onRetry: () => {},
    trigger: <Button variant="ghost">Notifications</Button>,
    isError: false,
    summary: null,
  },
};

export default meta;
type Story = StoryObj<typeof NotificationPopover>;

const populatedSummary: NotificationSummary = {
  totalUnread: 7,
  groups: [
    {
      kind: "episodes_since_last_seen",
      count: 3,
      sinceIso: new Date("2026-04-20T10:00:00.000Z").toISOString(),
    },
    {
      kind: "episodes_by_podcast",
      podcastId: 1,
      podcastTitle: "The Daily",
      count: 4,
    },
    {
      kind: "episodes_by_podcast",
      podcastId: 2,
      podcastTitle: "Hard Fork",
      count: 3,
    },
  ],
};

const emptySummary: NotificationSummary = {
  totalUnread: 0,
  groups: [],
};

export const DesktopPopulated: Story = {
  name: "Desktop / Populated",
  args: {
    summary: populatedSummary,
    forceSurface: "popover",
  },
};

export const DesktopLoading: Story = {
  name: "Desktop / Loading",
  args: {
    summary: null,
    isError: false,
    forceSurface: "popover",
  },
};

export const DesktopError: Story = {
  name: "Desktop / Error",
  args: {
    summary: null,
    isError: true,
    forceSurface: "popover",
  },
};

export const DesktopEmpty: Story = {
  name: "Desktop / Empty",
  args: {
    summary: emptySummary,
    forceSurface: "popover",
  },
};

export const MobilePopulated: Story = {
  name: "Mobile / Populated",
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  args: {
    summary: populatedSummary,
    forceSurface: "sheet",
  },
};
