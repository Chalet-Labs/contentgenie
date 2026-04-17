"use client";

import { useRouter } from "next/navigation";
import { Bell, Podcast } from "lucide-react";
import { markNotificationRead } from "@/app/actions/notifications";
import { formatRelativeTime, cn } from "@/lib/utils";
import { ROUTES } from "@/lib/routes";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  episodePodcastIndexId: string | null;
  episodeTitle: string | null;
  podcastTitle: string | null;
}

function NotificationIcon() {
  return <Podcast className="h-4 w-4 text-blue-500 shrink-0" />;
}

export function NotificationList({
  notifications,
  onItemClick,
}: {
  notifications: NotificationItem[];
  onItemClick?: () => void;
}) {
  const router = useRouter();

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <div className="mb-2 rounded-full bg-muted p-3">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm">No notifications yet</p>
      </div>
    );
  }

  const handleClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      try {
        await markNotificationRead(notification.id);
      } catch {
        // Keep UX responsive even if marking read fails
      }
    }
    router.push(
      notification.episodePodcastIndexId
        ? ROUTES.episode(notification.episodePodcastIndexId)
        : ROUTES.DASHBOARD
    );
    onItemClick?.();
  };

  return (
    <div className="divide-y">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          onClick={() => handleClick(notification)}
          className={cn(
            "flex w-full items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors",
            !notification.isRead && "bg-accent/20"
          )}
        >
          <NotificationIcon />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {notification.title}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {notification.body}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatRelativeTime(notification.createdAt)}
            </p>
          </div>
          {!notification.isRead && (
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
          )}
        </button>
      ))}
    </div>
  );
}
