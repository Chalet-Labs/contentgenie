"use client";

import { WifiOff } from "lucide-react";

interface OfflineBannerProps {
  isOffline: boolean;
}

export function OfflineBanner({ isOffline }: OfflineBannerProps) {
  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-md border border-status-warning-border bg-status-warning-bg px-4 py-2 text-sm text-status-warning-text"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>Offline mode — showing cached data</span>
    </div>
  );
}
