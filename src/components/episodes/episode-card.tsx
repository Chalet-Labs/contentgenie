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

export interface EpisodeCardProps {
  /** Podcast artwork URL. When omitted, no artwork tile is rendered. */
  artwork?: string | null;
  /** Podcast title shown as the kicker line above the episode title. */
  podcastTitle: string;
  /** Episode title — the primary heading. */
  title: string;
  /** Target of the title link. Only the title (and artwork, if present) are wrapped in the link. */
  href: string;
  /** Optional description; truncated to line-clamp-2. */
  description?: string | null;
  /** Topic chips rendered below the description; capped at 3. */
  topics?: string[];
  /** Worth-It score as a decimal string (DB shape). null | undefined → no pill. */
  score?: string | null;
  /** Summary processing state. Terminal "completed" is NOT rendered as a badge. */
  status?: SummaryStatus | null;
  /** Meta row cells rendered between description and action row. */
  meta: ReactNode[];
  /** Visual accent. `"unread"` applies the notification-unread bg tint. */
  accent?: "unread" | "none";
  /** Primary CTA shown in the action row as a full-text button (e.g. Listen). */
  primaryAction?: ReactNode;
  /** Icon-sized action slots (AddToQueueButton, ListenedButton, dismiss, remove, etc.). */
  secondaryActions?: ReactNode;
  /** When true, marks the card as listened — used for data attrs and future styling. */
  isListened?: boolean;
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
}: EpisodeCardProps) {
  // Only attempt to parse when the raw string is non-null and non-empty.
  // parseScoreOrNull returns null for non-finite inputs; treat null as "no pill".
  const parsedScore =
    score != null && score !== "" ? parseScoreOrNull(score) : undefined;

  return (
    <Card
      data-accent={accent}
      data-listened={isListened}
      className={cn(
        "group transition-colors hover:bg-accent/50",
        accent === "unread" && "bg-accent/10"
      )}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {artwork !== undefined && (
            <Link href={href} className="shrink-0">
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
                    <Rss className="h-8 w-8" />
                  </div>
                )}
              </div>
            </Link>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="truncate text-xs text-muted-foreground">
                  {podcastTitle}
                </p>
                <Link href={href} className="block">
                  <h3 className="line-clamp-2 font-semibold group-hover:text-primary">
                    {title}
                  </h3>
                </Link>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <StatusIcon status={status} />
                {parsedScore != null && (
                  <WorthItBadge score={parsedScore} />
                )}
              </div>
            </div>

            {description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {description}
              </p>
            )}

            {topics && topics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {topics.slice(0, 3).map((t) => (
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
