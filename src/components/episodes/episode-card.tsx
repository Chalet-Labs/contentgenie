import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, AlertCircle, Rss } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WorthItBadge } from "@/components/episodes/worth-it-badge";
import { parseScoreOrNull } from "@/lib/score-utils";
import type { SummaryStatus } from "@/db/schema";

export const MAX_DISPLAYED_TOPICS = 3;

export interface EpisodeCardProps {
  /** Podcast artwork URL. When omitted, no artwork tile is rendered. */
  artwork?: string | null;
  /** Podcast title shown as the kicker line above the episode title. */
  podcastTitle: string;
  /** When provided, wraps podcastTitle in a Link (e.g. /podcast/{id}). */
  podcastHref?: string;
  /** Episode title — the primary heading. */
  title: string;
  /**
   * Target of the title link. Only the title (and artwork, if present) are
   * wrapped. When omitted, title and artwork render as plain text — useful for
   * degenerate data states where there is no episode to navigate to.
   */
  href?: string;
  /** Optional description; truncated to line-clamp-2. */
  description?: string | null;
  /** Topic chips rendered below the description; capped at 3. */
  topics?: string[];
  /**
   * Worth-It score (DB decimal string).
   * - `undefined` (or prop omitted) → no badge rendered.
   * - `null` or unparseable → "Not rated" badge.
   * - parseable → score badge.
   */
  score?: string | null;
  /**
   * Summary processing state. Non-terminal states render a small StatusIcon;
   * `"failed"` renders an alert icon.
   */
  status?: SummaryStatus | null;
  /** Meta row cells rendered between description and action row. */
  meta: ReactNode[];
  /** Visual accent. `"unread"` applies the notification-unread bg tint. */
  accent?: "unread" | "none";
  /** Primary CTA shown in the action row as a full-text button (e.g. Listen). */
  primaryAction?: ReactNode;
  /** Icon-sized action slots (AddToQueueButton, ListenedButton, dismiss, remove, etc.). */
  secondaryActions?: ReactNode;
  /** When true, marks the card as listened. Drives the left-accent bar: `isListened !== true` renders the bar; `true` hides it. */
  isListened?: boolean;
  /**
   * Invoked when the user clicks the title or artwork link. Runs alongside the
   * Link's navigation — lets callers mark a notification as read, log analytics,
   * etc., without swapping the nav target.
   */
  onTitleClick?: () => void;
}

function ArtworkTile({
  href,
  artwork,
  podcastTitle,
  onClick,
}: {
  href?: string;
  artwork: string | null;
  podcastTitle: string;
  onClick?: () => void;
}) {
  const tile = (
    <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-muted">
      {artwork ? (
        <Image
          src={artwork}
          alt={podcastTitle}
          fill
          className="object-cover"
          sizes="80px"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
          <Rss className="h-8 w-8" aria-hidden="true" />
        </div>
      )}
    </div>
  );
  if (!href) return <div className="shrink-0">{tile}</div>;
  return (
    <Link
      href={href}
      className="shrink-0"
      aria-hidden="true"
      tabIndex={-1}
      onClick={onClick}
    >
      {tile}
    </Link>
  );
}

function StatusIcon({ status }: { status?: SummaryStatus | null }) {
  if (status === "queued" || status === "running" || status === "summarizing") {
    return (
      <Loader2
        className="h-3 w-3 animate-spin text-muted-foreground"
        aria-label="Processing"
      />
    );
  }
  if (status === "failed") {
    return (
      <AlertCircle
        className="h-3 w-3 text-destructive"
        aria-label="Summary failed"
      />
    );
  }
  return null;
}

export function EpisodeCard({
  artwork,
  podcastTitle,
  podcastHref,
  title,
  href,
  description,
  topics,
  score,
  status,
  meta,
  accent = "none",
  primaryAction,
  secondaryActions,
  isListened = false,
  onTitleClick,
}: EpisodeCardProps) {
  const parsedScore =
    score != null && score !== "" ? parseScoreOrNull(score) : null;

  return (
    <Card
      data-accent={accent}
      data-listened={isListened}
      data-status={status ?? undefined}
      className={cn(
        "group transition-colors hover:bg-accent/50",
        accent === "unread" && "bg-accent/10",
        isListened !== true && "border-l-2 border-l-primary",
      )}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {artwork !== undefined && (
            <ArtworkTile
              href={href}
              artwork={artwork}
              podcastTitle={podcastTitle}
              onClick={onTitleClick}
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                {podcastHref ? (
                  <Link
                    href={podcastHref}
                    className="block truncate text-xs text-muted-foreground hover:text-primary"
                  >
                    {podcastTitle}
                  </Link>
                ) : (
                  <p className="truncate text-xs text-muted-foreground">
                    {podcastTitle}
                  </p>
                )}
                {href ? (
                  <Link href={href} className="block" onClick={onTitleClick}>
                    <h3 className="line-clamp-2 font-semibold group-hover:text-primary">
                      {title}
                    </h3>
                  </Link>
                ) : (
                  <h3 className="line-clamp-2 font-semibold">{title}</h3>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusIcon status={status} />
                {score !== undefined && <WorthItBadge score={parsedScore} />}
              </div>
            </div>

            {description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {description}
              </p>
            )}

            {topics && topics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {topics.slice(0, MAX_DISPLAYED_TOPICS).map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            )}

            <div className="mt-3 border-t pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {meta}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {primaryAction}
                  {secondaryActions}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
