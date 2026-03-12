"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { getDashboardStats } from "@/app/actions/dashboard"

interface SidebarCountsContextValue {
  subscriptionCount: number
  savedCount: number
  isLoading: boolean
}

const SidebarCountsContext = createContext<SidebarCountsContextValue | null>(null)

export function SidebarCountsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [subscriptionCount, setSubscriptionCount] = useState(0)
  const [savedCount, setSavedCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)

    getDashboardStats().then((stats) => {
      if (cancelled) return
      setSubscriptionCount(stats.subscriptionCount)
      setSavedCount(stats.savedCount)
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [pathname])

  return (
    <SidebarCountsContext.Provider
      value={{ subscriptionCount, savedCount, isLoading }}
    >
      {children}
    </SidebarCountsContext.Provider>
  )
}

export function useSidebarCounts(): SidebarCountsContextValue {
  const ctx = useContext(SidebarCountsContext)
  if (!ctx) {
    throw new Error("useSidebarCounts must be used within SidebarCountsProvider")
  }
  return ctx
}

/** Safe variant — returns zero counts when rendered outside the provider (e.g. public landing page). */
export function useSidebarCountsOptional(): SidebarCountsContextValue {
  const ctx = useContext(SidebarCountsContext)
  return ctx ?? { subscriptionCount: 0, savedCount: 0, isLoading: false }
}
