"use client";

import { useRouter } from "next/navigation";
import { Bell, FileText, Podcast } from "lucide-react";
import { markNotificationRead } from "@/app/actions/notifications";
import { formatRelativeTime } from "@/lib/utils";

interface NotificationItem {
  id: number;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
  episodeId: number | null;
  episodeTitle: string | null;
  podcastTitle: string | null;
}

function NotificationIcon({ type }: { type: string }) {
  if (type === "summary_completed") {
    return <FileText className="h-4 w-4 text-green-500 shrink-0" />;
  }
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
        <Bell className="h-8 w-8 mb-2 opacity-50" />
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
    if (notification.episodeId !== null) {
      router.push(`/episode/${notification.episodeId}`);
    }
    onItemClick?.();
  };

  return (
    <div className="divide-y">
      {notifications.map((notification) => (
        <button
          key={notification.id}
          onClick={() => handleClick(notification)}
          className={`w-full flex items-start gap-3 p-3 text-left hover:bg-accent/50 transition-colors ${
            !notification.isRead ? "bg-accent/20" : ""
          }`}
        >
          <NotificationIcon type={notification.type} />
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
