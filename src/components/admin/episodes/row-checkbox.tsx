"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { useSelection } from "@/components/admin/episodes/selection-context"

interface RowCheckboxProps {
  episodeId: number
}

export function RowCheckbox({ episodeId }: RowCheckboxProps) {
  const { selectedIds, toggle } = useSelection()

  return (
    <Checkbox
      checked={selectedIds.has(episodeId)}
      onCheckedChange={() => toggle(episodeId)}
      aria-label={`Select episode ${episodeId}`}
    />
  )
}
