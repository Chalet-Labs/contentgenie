"use client";

import { useAuth } from "@clerk/nextjs";
import {
  AudioPlayerProvider,
  useAudioPlayerState,
} from "@/contexts/audio-player-context";
import { SyncQueueProvider } from "@/contexts/sync-queue-context";
import { SidebarCountsProvider } from "@/contexts/sidebar-counts-context";
import { PinnedSubscriptionsProvider } from "@/contexts/pinned-subscriptions-context";
import { AppHeader } from "@/components/layout/app-header";
import { Sidebar } from "@/components/layout/sidebar";
import { PlayerBar } from "@/components/audio-player/player-bar";
import { InstallBanner } from "@/components/pwa/install-banner";
import { ADMIN_ROLE } from "@/lib/auth-roles";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { isVisible } = useAudioPlayerState();
  // Compute admin status once at the AppShell level and pass down, so SidebarNav
  // instances (desktop aside + mobile sheet) share a single Clerk hook call.
  // Gate on isLoaded to avoid a false-negative flash while Clerk is hydrating.
  const { isLoaded, has } = useAuth();
  const isAdmin = isLoaded ? (has?.({ role: ADMIN_ROLE }) ?? false) : false;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={isAdmin} />
      <div className="flex">
        <Sidebar isAdmin={isAdmin} />
        <main
          className={`flex-1 overflow-auto p-4 sm:p-6 ${isVisible ? "pb-24 md:pb-[104px]" : ""}`}
        >
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <PlayerBar />
      <InstallBanner />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SyncQueueProvider>
      <AudioPlayerProvider>
        <SidebarCountsProvider>
          <PinnedSubscriptionsProvider>
            <AppShellInner>{children}</AppShellInner>
          </PinnedSubscriptionsProvider>
        </SidebarCountsProvider>
      </AudioPlayerProvider>
    </SyncQueueProvider>
  );
}
