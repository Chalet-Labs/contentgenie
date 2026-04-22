import Link from "next/link";
import { Bell } from "lucide-react";
import type { NotificationSummary } from "@/app/actions/notifications";

interface NotificationSummaryListProps {
  summary: NotificationSummary;
}

function pluralEpisode(count: number): string {
  return count === 1 ? "1 new episode" : `${count} new episodes`;
}

function pluralNotification(count: number): string {
  return count === 1 ? "1 unread notification" : `${count} unread notifications`;
}

function SummaryRow({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent/50 focus-visible:outline-none focus-visible:bg-accent/50"
      >
        {children}
      </Link>
    </li>
  );
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

  // Unread exists but nothing groups into an episode bucket (e.g., only
  // summary_completed rows). Surface a link so the bell badge and popover agree.
  if (summary.groups.length === 0) {
    return (
      <ul className="divide-y">
        <SummaryRow href="/notifications">
          {pluralNotification(summary.totalUnread)}
        </SummaryRow>
      </ul>
    );
  }

  return (
    <ul className="divide-y">
      {summary.groups.map((group, i) => {
        switch (group.kind) {
          case "episodes_since_last_seen":
            return (
              <SummaryRow
                key={`since-${i}`}
                href={`/notifications?since=${group.sinceIso}`}
              >
                {pluralEpisode(group.count)} since last visit
              </SummaryRow>
            );
          case "episodes_by_podcast":
            return (
              <SummaryRow
                key={`podcast-${group.podcastId}`}
                href={`/notifications?podcast=${group.podcastId}`}
              >
                {pluralEpisode(group.count)} from {group.podcastTitle}
              </SummaryRow>
            );
          default: {
            const _exhaustive: never = group;
            throw new Error(`Unhandled NotificationGroup: ${JSON.stringify(_exhaustive)}`);
          }
        }
      })}
    </ul>
  );
}
