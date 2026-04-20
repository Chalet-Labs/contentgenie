import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getNotifications, getEpisodeTopics } from "@/app/actions/notifications";
import { NotificationPageList } from "@/components/notifications/notification-page-list";

export const metadata: Metadata = {
  title: "Notifications · ContentGenie",
};

export default async function NotificationsPage() {
  await auth();

  const { notifications, hasMore } = await getNotifications(50, 0);

  const episodeIds = notifications
    .map((n) => n.episodeDbId)
    .filter((id): id is number => id !== null);

  const topicsMap =
    episodeIds.length > 0 ? await getEpisodeTopics(episodeIds) : new Map<number, string[]>();

  const topicsByEpisode: Record<number, string[]> = {};
  topicsMap.forEach((topics, id) => {
    topicsByEpisode[id] = topics;
  });

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
