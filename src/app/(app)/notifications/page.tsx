import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { AlertCircle } from "lucide-react";
import {
  getNotifications,
  getEpisodeTopics,
} from "@/app/actions/notifications";
import { getListenedEpisodeIds } from "@/app/actions/listen-history";
import { NotificationPageList } from "@/components/notifications/notification-page-list";
import { NOTIFICATIONS_PAGE_SIZE } from "@/lib/notifications-constants";
import type { PodcastIndexEpisodeId } from "@/types/ids";

export const metadata: Metadata = {
  title: "Notifications",
};

// Postgres `serial` upper bound — reject IDs that would overflow the DB column.
const MAX_SERIAL_ID = 2_147_483_647;

// Strict enough that "2026", "04/20/2026", or "Thu Apr 20 2026" (all accepted by
// `new Date()`) don't slip past input validation. Requires the `YYYY-MM-DDTHH:MM:SS`
// shell with optional fractional seconds and a `Z` or `±HH:MM` offset.
const ISO_INSTANT_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;

// Stricter than parseInt: rejects "42abc", "42.5", "-5", and values above the
// Postgres serial range. Silent coercion would let upstream linker bugs
// (malformed URLs in emails, push payloads) masquerade as healthy requests.
function parsePositiveInt(raw: string, name: string): number | undefined {
  const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (Number.isSafeInteger(n) && n > 0 && n <= MAX_SERIAL_ID) return n;
  console.warn(`Invalid '${name}' searchParam on /notifications: ${raw}`);
  return undefined;
}

function parseIsoDate(raw: string, name: string): Date | undefined {
  if (ISO_INSTANT_RE.test(raw)) {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  console.warn(`Invalid '${name}' searchParam on /notifications: ${raw}`);
  return undefined;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams?: { podcast?: string; since?: string };
}) {
  await auth();

  const params = searchParams ?? {};
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
      <div className="py-8">
        <h1 className="mb-4 text-2xl font-semibold">Notifications</h1>
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-24 text-muted-foreground"
        >
          <div className="mb-3 rounded-full bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">
            Couldn&apos;t load notifications
          </p>
          <p className="mt-1 text-xs">Try refreshing the page.</p>
        </div>
      </div>
    );
  }

  const { notifications, hasMore } = result;

  const episodeIds = notifications
    .map((n) => n.episodeDbId)
    .filter((id): id is number => id !== null);

  const [topicsByEpisode, listenedDbIds] = await Promise.all([
    episodeIds.length > 0 ? getEpisodeTopics(episodeIds) : Promise.resolve({}),
    episodeIds.length > 0
      ? getListenedEpisodeIds(episodeIds)
      : Promise.resolve<number[]>([]),
  ]);

  const listenedDbIdSet = new Set(listenedDbIds);
  const initialListenedIds = notifications.flatMap((n) => {
    if (
      n.episodeDbId !== null &&
      listenedDbIdSet.has(n.episodeDbId) &&
      n.episodePodcastIndexId !== null
    ) {
      return [n.episodePodcastIndexId]; // narrowed to PodcastIndexEpisodeId
    }
    return [];
  });

  return (
    <div className="py-8">
      <NotificationPageList
        initialItems={notifications}
        initialHasMore={hasMore ?? false}
        initialTopicsByEpisode={topicsByEpisode}
        initialListenedIds={initialListenedIds}
        filter={filter}
      />
    </div>
  );
}
