import type { Meta, StoryObj } from "@storybook/react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { NotificationList } from "@/components/notifications/notification-list";

// NotificationBell uses server actions (getUnreadCount, getNotifications,
// markAllNotificationsRead) that can't be mocked at the story level. We create
// lightweight display components that mirror each visual state.

const meta: Meta = {
  title: "Notifications/NotificationBell",
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj;

const now = new Date("2026-01-15T10:00:00Z");

// No unread notifications — bell icon only, no badge
export const NoUnread: Story = {
  render: () => (
    <Button variant="ghost" size="icon" className="relative">
      <Bell className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">Notifications</span>
    </Button>
  ),
};

// Unread badge showing count
export const WithUnread: Story = {
  render: () => (
    <Button variant="ghost" size="icon" className="relative">
      <Bell className="h-[1.2rem] w-[1.2rem]" />
      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
        3
      </span>
      <span className="sr-only">Notifications</span>
    </Button>
  ),
};

// High unread count capped at 99+
export const HighUnread: Story = {
  render: () => (
    <Button variant="ghost" size="icon" className="relative">
      <Bell className="h-[1.2rem] w-[1.2rem]" />
      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
        99+
      </span>
      <span className="sr-only">Notifications</span>
    </Button>
  ),
};

// Popover open with notifications list
export const PopoverOpen: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            2
          </span>
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Mark all as read
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <NotificationList
            notifications={[
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
            ]}
            onItemClick={() => {}}
          />
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Popover open with empty state
export const PopoverEmpty: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <NotificationList notifications={[]} onItemClick={() => {}} />
        </div>
      </PopoverContent>
    </Popover>
  ),
};

// Loading state inside popover
export const PopoverLoading: Story = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-[1.2rem] w-[1.2rem]" />
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            5
          </span>
          <span className="sr-only">Notifications</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
        </div>
        <div className="max-h-80 overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
