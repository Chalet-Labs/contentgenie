import Link from "next/link";
import {
  Megaphone,
  AlertOctagon,
  Scale,
  Handshake,
  Calendar,
  Lightbulb,
  Book,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { badgeVariants } from "@/components/ui/badge";
import type { CanonicalTopicKind, CanonicalTopicStatus } from "@/db/schema";

export interface TopicChipProps {
  canonicalTopicId: number;
  label: string;
  kind: CanonicalTopicKind;
  status?: CanonicalTopicStatus;
  className?: string;
}

interface KindMeta {
  Icon: LucideIcon;
  iconClass: string;
}

const kindMeta: Record<CanonicalTopicKind, KindMeta> = {
  release: { Icon: Megaphone, iconClass: "text-blue-500" },
  announcement: { Icon: Megaphone, iconClass: "text-blue-500" },
  incident: { Icon: AlertOctagon, iconClass: "text-destructive" },
  regulation: { Icon: Scale, iconClass: "text-indigo-500" },
  deal: { Icon: Handshake, iconClass: "text-emerald-500" },
  event: { Icon: Calendar, iconClass: "text-amber-500" },
  concept: { Icon: Lightbulb, iconClass: "text-violet-500" },
  work: { Icon: Book, iconClass: "text-orange-500" },
  other: { Icon: Tag, iconClass: "text-muted-foreground" },
};

export function TopicChip({
  canonicalTopicId,
  label,
  kind,
  status,
  className,
}: TopicChipProps) {
  const { Icon, iconClass } = kindMeta[kind];

  return (
    <Link
      href={`/topic/${canonicalTopicId}`}
      className={cn(
        badgeVariants({ variant: "outline" }),
        "gap-1 text-xs font-normal hover:bg-accent/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        status === "dormant" && "opacity-60",
        className,
      )}
      aria-label={`Topic: ${label} — ${kind}`}
    >
      <Icon className={cn("h-3 w-3", iconClass)} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
