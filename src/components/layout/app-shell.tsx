"use client"

import { AudioPlayerProvider, useAudioPlayerState } from "@/contexts/audio-player-context"
import { Header } from "@/components/layout/header"
import { Sidebar } from "@/components/layout/sidebar"
import { PlayerBar } from "@/components/audio-player/player-bar"

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { isVisible } = useAudioPlayerState()

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className={`flex-1 overflow-auto p-4 sm:p-6 ${isVisible ? "pb-24 md:pb-[104px]" : ""}`}>
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
      <PlayerBar />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AudioPlayerProvider>
      <AppShellInner>{children}</AppShellInner>
    </AudioPlayerProvider>
  )
}
