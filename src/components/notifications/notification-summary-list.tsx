import Link from "next/link";
import { Bell } from "lucide-react";
import type {
  NotificationGroup,
  NotificationSummary,
} from "@/app/actions/notifications";

interface NotificationSummaryListProps {
  summary: NotificationSummary;
  onItemClick?: (groupKey: string) => void;
}

export function groupKeyOf(group: NotificationGroup): string {
  return group.kind === "episodes_since_last_seen"
    ? `since-${group.sinceIso}`
    : `podcast-${group.podcastId}`;
}

function pluralEpisode(count: number): string {
  return count === 1 ? "1 new episode" : `${count} new episodes`;
}

function pluralNotification(count: number): string {
  return count === 1
    ? "1 unread notification"
    : `${count} unread notifications`;
}

function SummaryRow({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onClick}
        className="flex items-center justify-between px-4 py-3 text-sm hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none"
      >
        {children}
      </Link>
    </li>
  );
}

export function NotificationSummaryList({
  summary,
  onItemClick,
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
      {summary.groups.map((group) => {
        const key = groupKeyOf(group);
        // Skip the callback (and the cosmetic removal it drives) when the user
        // modifier/middle-clicks — those clicks open a new tab, so the group
        // should stay visible in the still-open popover instead of disappearing.
        const handleClick = onItemClick
          ? (e: React.MouseEvent<HTMLAnchorElement>) => {
              if (
                e.defaultPrevented ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              ) {
                return;
              }
              onItemClick(key);
            }
          : undefined;
        switch (group.kind) {
          case "episodes_since_last_seen":
            return (
              <SummaryRow
                key={key}
                href={`/notifications?since=${encodeURIComponent(group.sinceIso)}`}
                onClick={handleClick}
              >
                {pluralEpisode(group.count)} since last visit
              </SummaryRow>
            );
          case "episodes_by_podcast":
            return (
              <SummaryRow
                key={key}
                href={`/notifications?podcast=${group.podcastId}`}
                onClick={handleClick}
              >
                {pluralEpisode(group.count)} from {group.podcastTitle}
              </SummaryRow>
            );
          default: {
            const _exhaustive: never = group;
            throw new Error(
              `Unhandled NotificationGroup: ${JSON.stringify(_exhaustive)}`,
            );
          }
        }
      })}
    </ul>
  );
}
