import Link from "next/link";
import { Bell } from "lucide-react";
import type { NotificationSummary } from "@/app/actions/notifications";

interface NotificationSummaryListProps {
  summary: NotificationSummary;
}

function pluralEpisode(count: number): string {
  return count === 1 ? "1 new episode" : `${count} new episodes`;
}

export function NotificationSummaryList({
  summary,
}: NotificationSummaryListProps) {
  if (summary.totalUnread === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <div className="mb-3 rounded-full bg-muted p-4">
          <Bell className="h-6 w-6" />
        </div>
        <p className="text-sm font-medium">You&apos;re all caught up</p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {summary.groups.map((group, i) => {
        switch (group.kind) {
          case "episodes_since_last_seen":
            return (
              <li key={`since-${i}`}>
                <Link
                  href={`/notifications?since=${summary.lastSeenAt!.toISOString()}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50"
                >
                  {pluralEpisode(group.count)} since last visit
                </Link>
              </li>
            );
          case "episodes_by_podcast":
            return (
              <li key={`podcast-${group.podcastId}`}>
                <Link
                  href={`/notifications?podcast=${group.podcastId}`}
                  className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50"
                >
                  {pluralEpisode(group.count)} from {group.podcastTitle}
                </Link>
              </li>
            );
          default: {
            const _exhaustive: never = group;
            return _exhaustive;
          }
        }
      })}
    </ul>
  );
}
