import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationPopover } from "@/components/notifications/notification-popover";
import type { NotificationSummary } from "@/app/actions/notifications";

// NotificationBell wires server actions (getUnreadCount, getNotificationSummary)
// and next/navigation (usePathname) which can't be mocked at the story level.
// These display-layer stories render the trigger + popover in each state directly.

const meta: Meta = {
  title: "Notifications/NotificationBell",
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj;

function BellTrigger({ count }: { count?: number }) {
  return (
    <Button variant="ghost" size="icon" className="relative" title="Notifications">
      <Bell className="h-[1.2rem] w-[1.2rem]" />
      {count !== undefined && count > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="sr-only">Notifications</span>
    </Button>
  );
}

const populatedSummary: NotificationSummary = {
  totalUnread: 7,
  lastSeenAt: new Date("2026-04-20T10:00:00.000Z"),
  groups: [
    { kind: "episodes_since_last_seen", count: 3 },
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
  lastSeenAt: null,
  groups: [],
};

export const Closed: Story = {
  render: () => <BellTrigger count={3} />,
};

export const NoUnread: Story = {
  render: () => <BellTrigger />,
};

export const HighUnread: Story = {
  render: () => <BellTrigger count={150} />,
};

export const OpenPopulated: Story = {
  name: "Open / Populated",
  render: () => (
    <NotificationPopover
      open={true}
      onOpenChange={() => {}}
      trigger={<BellTrigger count={7} />}
      summary={populatedSummary}
      isError={false}
      onRetry={() => {}}
      forceSurface="popover"
    />
  ),
};

export const OpenLoading: Story = {
  name: "Open / Loading",
  render: () => (
    <NotificationPopover
      open={true}
      onOpenChange={() => {}}
      trigger={<BellTrigger count={3} />}
      summary={null}
      isError={false}
      onRetry={() => {}}
      forceSurface="popover"
    />
  ),
};

export const OpenError: Story = {
  name: "Open / Error",
  render: () => (
    <NotificationPopover
      open={true}
      onOpenChange={() => {}}
      trigger={<BellTrigger count={3} />}
      summary={null}
      isError={true}
      onRetry={() => {}}
      forceSurface="popover"
    />
  ),
};

export const OpenEmpty: Story = {
  name: "Open / Empty",
  render: () => (
    <NotificationPopover
      open={true}
      onOpenChange={() => {}}
      trigger={<BellTrigger />}
      summary={emptySummary}
      isError={false}
      onRetry={() => {}}
      forceSurface="popover"
    />
  ),
};
