import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AlertCircle } from "lucide-react";
import { getNotifications, getEpisodeTopics } from "@/app/actions/notifications";
import { NotificationPageList } from "@/components/notifications/notification-page-list";
import { NOTIFICATIONS_PAGE_SIZE } from "@/lib/notifications-constants";

export const metadata: Metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  await auth();

  const result = await getNotifications(NOTIFICATIONS_PAGE_SIZE, 0);

  if (result.error) {
    return (
      <div className="container max-w-2xl py-8">
        <h1 className="mb-4 text-2xl font-semibold">Notifications</h1>
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-24 text-muted-foreground"
        >
          <div className="mb-3 rounded-full bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">Couldn&apos;t load notifications</p>
          <p className="mt-1 text-xs">Try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const { notifications, hasMore } = result;

  const episodeIds = notifications
    .map((n) => n.episodeDbId)
    .filter((id): id is number => id !== null);

  const topicsByEpisode =
    episodeIds.length > 0 ? await getEpisodeTopics(episodeIds) : {};

  return (
    <div className="container max-w-2xl py-8">
      <NotificationPageList
        initialItems={notifications}
        initialHasMore={hasMore ?? false}
        initialTopicsByEpisode={topicsByEpisode}
      />
    </div>
  );
}
