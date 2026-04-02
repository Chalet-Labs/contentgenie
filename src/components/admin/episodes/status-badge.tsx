import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

const statusStyles: Record<string, string> = {
  available: "bg-status-success-bg text-status-success-text",
  completed: "bg-status-success-bg text-status-success-text",
  fetching: "bg-status-warning-bg text-status-warning-text",
  running: "bg-status-warning-bg text-status-warning-text",
  summarizing: "bg-status-warning-bg text-status-warning-text",
  queued: "bg-status-info-bg text-status-info-text",
  failed: "bg-status-danger-bg text-status-danger-text",
  missing: "bg-status-neutral-bg text-status-neutral-text",
}

const fallbackStyle = "bg-status-neutral-bg text-status-neutral-text"

interface StatusBadgeProps {
  status: string | null | undefined
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn("border-0", statusStyles[status ?? ""] ?? fallbackStyle)}
    >
      {status ?? "unprocessed"}
    </Badge>
  )
}
