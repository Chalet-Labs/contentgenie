import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

// NotificationSettings uses browser APIs (Notification, serviceWorker) and
// server actions that can't run in Storybook. We create lightweight display
// components that mirror each visual state.

const meta: Meta = {
  title: "Notifications/NotificationSettings",
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="max-w-lg">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj;

// Default state — permission not yet requested, push not enabled
export const Default: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">Push Notifications</span>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
        </div>
        <Button variant="outline">Enable</Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label id="digest-frequency-label">Notification Frequency</Label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        <Select defaultValue="realtime">
          <SelectTrigger className="w-[140px]" aria-labelledby="digest-frequency-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="realtime">Realtime</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  ),
};

// Permission granted, push enabled — user can disable
export const Granted: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">Push Notifications</span>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
        </div>
        <Button variant="outline">Disable</Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label id="digest-frequency-label">Notification Frequency</Label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        <Select defaultValue="daily">
          <SelectTrigger className="w-[140px]" aria-labelledby="digest-frequency-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="realtime">Realtime</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  ),
};

// Permission denied by browser — button disabled with "Blocked" label
export const Denied: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">Push Notifications</span>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
          <p className="text-xs text-destructive">
            Push notifications are blocked. Please enable them in your browser
            settings.
          </p>
        </div>
        <Button variant="outline" disabled>
          Blocked
        </Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label id="digest-frequency-label">Notification Frequency</Label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        <Select defaultValue="realtime">
          <SelectTrigger className="w-[140px]" aria-labelledby="digest-frequency-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="realtime">Realtime</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  ),
};

// Browser does not support push notifications
export const Unsupported: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">Push Notifications</span>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
          <p className="text-xs text-muted-foreground">
            Push notifications are not supported in this browser.
          </p>
        </div>
        <Button variant="outline" disabled>
          Unsupported
        </Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label id="digest-frequency-label">Notification Frequency</Label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        <Select defaultValue="realtime">
          <SelectTrigger className="w-[140px]" aria-labelledby="digest-frequency-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="realtime">Realtime</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  ),
};

// Toggling state — button shows "Enabling..."
export const Enabling: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">Push Notifications</span>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
        </div>
        <Button variant="outline" disabled>
          Enabling...
        </Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label id="digest-frequency-label">Notification Frequency</Label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        <Select defaultValue="realtime">
          <SelectTrigger className="w-[140px]" aria-labelledby="digest-frequency-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="realtime">Realtime</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  ),
};

// Loading state — preferences not yet fetched
export const Loading: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <span className="text-sm font-medium">Push Notifications</span>
          <p className="text-sm text-muted-foreground">
            Get browser notifications when new summaries are available.
          </p>
        </div>
        <Button variant="outline">Enable</Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label id="digest-frequency-label">Notification Frequency</Label>
          <p className="text-sm text-muted-foreground">
            How often to receive push notification digests.
          </p>
        </div>
        <div className="h-10 w-[140px] animate-pulse rounded-md bg-muted" />
      </div>

      <p className="text-xs text-muted-foreground">
        Note: On iOS Safari, push notifications only work when ContentGenie is
        installed as a PWA (Add to Home Screen, iOS 16.4+).
      </p>
    </div>
  ),
};
