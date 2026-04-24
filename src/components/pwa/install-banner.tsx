"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { Logo } from "@/components/brand/logo";

export function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <div
      role="complementary"
      aria-label="Install app"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 duration-300 animate-in slide-in-from-bottom md:hidden"
    >
      <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-lg">
        <Logo variant="mark" size={40} decorative className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-card-foreground">
            Install ContentGenie
          </p>
          <p className="text-xs text-muted-foreground">
            Get the full app experience
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" onClick={() => void promptInstall()}>
            Install
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={dismiss}
            aria-label="Dismiss install banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
