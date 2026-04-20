import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";

// NotificationBell uses server actions (getUnreadCount) and next/link that
// can't be mocked at the story level. These lightweight display components
// mirror each visual state.

const meta: Meta = {
  title: "Notifications/NotificationBell",
  parameters: {
    layout: "centered",
  },
};

export default meta;
type Story = StoryObj;

export const NoUnread: Story = {
  render: () => (
    <Button variant="ghost" size="icon" className="relative">
      <Bell className="h-[1.2rem] w-[1.2rem]" />
      <span className="sr-only">Notifications</span>
    </Button>
  ),
};

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
