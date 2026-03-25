const statusStyles: Record<string, string> = {
  available: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  completed: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  fetching: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  summarizing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  queued: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  missing: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
}

interface StatusBadgeProps {
  status: string | null | undefined
}

export function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
        none
      </span>
    )
  }

  const cls = statusStyles[status] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {status}
    </span>
  )
}
