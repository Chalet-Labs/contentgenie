"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ENGAGEMENT_NAV_COUNT = 2;
const ENGAGEMENT_TIME_MS = 30_000; // 30 seconds

export interface UsePwaInstallReturn {
  /** True when the install banner should be shown */
  canInstall: boolean;
  /** True when running in standalone/installed mode */
  isInstalled: boolean;
  /** Trigger the native install prompt. Returns true if user accepted. */
  promptInstall: () => Promise<boolean>;
  /** Dismiss the banner with a 7-day cooldown. */
  dismiss: () => void;
}

function isDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const timestamp = Number(raw);
    if (Number.isNaN(timestamp)) return false;
    return Date.now() - timestamp < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function writeDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Private browsing or quota exceeded — silently ignore
  }
}

export function usePwaInstall(): UsePwaInstallReturn {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const visitedPaths = useRef<Set<string>>(new Set());
  const pathname = usePathname();

  // --- Standalone detection ---
  useEffect(() => {
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");
    if (
      standaloneMedia.matches ||
      ("standalone" in navigator &&
        (navigator as Record<string, unknown>).standalone === true)
    ) {
      setIsInstalled(true);
    }
  }, []);

  // --- beforeinstallprompt listener ---
  useEffect(() => {
    function handleBeforeInstallPrompt(e: BeforeInstallPromptEvent) {
      e.preventDefault();
      deferredPrompt.current = e;
      setPromptAvailable(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
    };
  }, []);

  // --- appinstalled listener ---
  useEffect(() => {
    function handleInstalled() {
      setIsInstalled(true);
      deferredPrompt.current = null;
      setPromptAvailable(false);
    }

    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  // --- Engagement: navigation count ---
  useEffect(() => {
    visitedPaths.current.add(pathname);
    if (visitedPaths.current.size >= ENGAGEMENT_NAV_COUNT) {
      setEngaged(true);
    }
  }, [pathname]);

  // --- Engagement: 30-second timer ---
  useEffect(() => {
    const timer = setTimeout(() => {
      setEngaged(true);
    }, ENGAGEMENT_TIME_MS);
    return () => clearTimeout(timer);
  }, []);

  // --- Dismissal check ---
  useEffect(() => {
    setDismissed(isDismissed());
  }, []);

  // --- promptInstall ---
  const promptInstall = useCallback(async (): Promise<boolean> => {
    const prompt = deferredPrompt.current;
    if (!prompt) return false;

    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      return outcome === "accepted";
    } finally {
      // Prompt is one-shot — always clean up ref and state
      deferredPrompt.current = null;
      setPromptAvailable(false);
    }
  }, []);

  // --- dismiss ---
  const dismiss = useCallback(() => {
    writeDismissal();
    setDismissed(true);
  }, []);

  const canInstall =
    promptAvailable && engaged && !dismissed && !isInstalled;

  return { canInstall, isInstalled, promptInstall, dismiss };
}
