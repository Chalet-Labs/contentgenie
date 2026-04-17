"use client"

import { AudioPlayerProvider, useAudioPlayerState } from "@/contexts/audio-player-context"
import { SyncQueueProvider } from "@/contexts/sync-queue-context"
import { SidebarCountsProvider } from "@/contexts/sidebar-counts-context"
import { AppHeader } from "@/components/layout/app-header"
import { Sidebar } from "@/components/layout/sidebar"
import { PlayerBar } from "@/components/audio-player/player-bar"
import { InstallBanner } from "@/components/pwa/install-banner"

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { isVisible } = useAudioPlayerState()

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <div className="flex">
        <Sidebar />
        <main className={`flex-1 overflow-auto p-4 sm:p-6 ${isVisible ? "pb-24 md:pb-[104px]" : ""}`}>
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
      <PlayerBar />
      <InstallBanner />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SyncQueueProvider>
      <AudioPlayerProvider>
        <SidebarCountsProvider>
          <AppShellInner>{children}</AppShellInner>
        </SidebarCountsProvider>
      </AudioPlayerProvider>
    </SyncQueueProvider>
  )
}
