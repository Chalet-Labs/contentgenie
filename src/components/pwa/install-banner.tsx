"use client";

import { Headphones, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePwaInstall } from "@/hooks/use-pwa-install";

export function InstallBanner() {
  const { canInstall, promptInstall, dismiss } = usePwaInstall();

  if (!canInstall) return null;

  return (
    <div
      role="complementary"
      aria-label="Install app"
      className="fixed bottom-0 left-0 right-0 z-40 p-4 md:hidden animate-in slide-in-from-bottom duration-300"
    >
      <div className="flex items-center gap-3 rounded-lg bg-zinc-900 p-4 shadow-lg dark:bg-zinc-800">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <Headphones className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">
            Install ContentGenie
          </p>
          <p className="text-xs text-zinc-400">
            Get the full app experience
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => void promptInstall()}>
            Install
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
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
