"use client";

import { Smartphone, Share, PlusSquare, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePwaInstall } from "@/hooks/use-pwa-install";

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function InstallAppCard() {
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="h-5 w-5" />
          Install App
        </CardTitle>
        <CardDescription>
          Install ContentGenie for a native app experience.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isInstalled ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-600 dark:text-green-400">
              Installed
            </span>
          </div>
        ) : canInstall ? (
          <Button onClick={() => void promptInstall()}>Install</Button>
        ) : isIos() ? (
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-2">
              <Share className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Tap the <strong>Share</strong> button in Safari
              </span>
            </li>
            <li className="flex items-start gap-2">
              <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                Scroll down and tap{" "}
                <strong>&quot;Add to Home Screen&quot;</strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-xs font-bold text-muted-foreground">
                3
              </span>
              <span>
                Tap <strong>&quot;Add&quot;</strong> to confirm
              </span>
            </li>
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">
            Install is not available on this browser.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
