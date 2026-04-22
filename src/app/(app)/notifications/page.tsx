import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AlertCircle } from "lucide-react";
import { getNotifications, getEpisodeTopics } from "@/app/actions/notifications";
import { NotificationPageList } from "@/components/notifications/notification-page-list";
import { NOTIFICATIONS_PAGE_SIZE } from "@/lib/notifications-constants";

export const metadata: Metadata = {
  title: "Notifications",
};

// Stricter than parseInt: rejects "42abc", "42.5", "-5" — silent coercion would
// let upstream linker bugs (malformed URLs in emails, push payloads) masquerade
// as healthy requests.
function parsePositiveInt(raw: string, name: string): number | undefined {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isInteger(n) && n > 0) return n;
  console.warn(`Invalid '${name}' searchParam on /notifications: ${raw}`);
  return undefined;
}

function parseIsoDate(raw: string, name: string): Date | undefined {
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  console.warn(`Invalid '${name}' searchParam on /notifications: ${raw}`);
  return undefined;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: Promise<{ podcast?: string; since?: string }>;
}) {
  await auth();

  const params = searchParams ? await searchParams : {};
  const podcastId =
    params.podcast !== undefined
      ? parsePositiveInt(params.podcast, "podcast")
      : undefined;
  const since =
    params.since !== undefined
      ? parseIsoDate(params.since, "since")
      : undefined;

  const filter =
    podcastId !== undefined || since !== undefined
      ? {
          ...(podcastId !== undefined && { podcastId }),
          ...(since !== undefined && { since }),
        }
      : undefined;

  const result = await getNotifications(NOTIFICATIONS_PAGE_SIZE, 0, filter);

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
        filter={filter}
      />
    </div>
  );
}
