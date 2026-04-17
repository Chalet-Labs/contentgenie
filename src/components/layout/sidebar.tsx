"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Search,
  Rss,
  Library,
  Settings,
  Shield,
} from "lucide-react"
import { SheetClose } from "@/components/ui/sheet"
import { useSidebarCountsOptional, getBadgeCount, NavBadge } from "@/contexts/sidebar-counts-context"

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/subscriptions", label: "Subscriptions", icon: Rss },
  { href: "/library", label: "Library", icon: Library },
]

const bottomLinks = [
  { href: "/settings", label: "Settings", icon: Settings },
]

function MaybeSheetClose({
  inSheet,
  children,
}: {
  inSheet: boolean
  children: React.ReactElement
}) {
  return inSheet ? <SheetClose asChild>{children}</SheetClose> : children
}

function SidebarNav({ inSheet, isAdmin }: { inSheet: boolean; isAdmin: boolean }) {
  const pathname = usePathname()
  const counts = useSidebarCountsOptional()

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {sidebarLinks.map((link) => {
            const Icon = link.icon
            const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)
            const badge = getBadgeCount(link.href, counts)
            return (
              <MaybeSheetClose key={link.href} inSheet={inSheet}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                  {badge !== null && <NavBadge count={badge} />}
                </Link>
              </MaybeSheetClose>
            )
          })}
        </nav>
      </div>

      <div className="py-4 border-t space-y-3">
        <div className="px-3">
          <OrganizationSwitcher
            hidePersonal={false}
            afterSelectOrganizationUrl="/settings"
            appearance={{
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger:
                  "w-full justify-start px-3 py-2 text-sm font-medium rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
              },
            }}
          />
        </div>
        <nav className="space-y-1 px-3">
          {bottomLinks.map((link) => {
            const Icon = link.icon
            const isActive = pathname === link.href
            return (
              <MaybeSheetClose key={link.href} inSheet={inSheet}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </MaybeSheetClose>
            )
          })}
          {isAdmin && (
            <MaybeSheetClose inSheet={inSheet}>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  pathname === "/admin" || pathname?.startsWith("/admin/")
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            </MaybeSheetClose>
          )}
        </nav>
      </div>
    </div>
  )
}

export function Sidebar({
  inSheet = false,
  isAdmin,
}: {
  inSheet?: boolean
  isAdmin: boolean
}) {
  if (inSheet) {
    return <SidebarNav inSheet isAdmin={isAdmin} />
  }

  return (
    <aside className="hidden md:flex flex-col w-64 border-r bg-background h-[calc(100vh-3.5rem)]">
      <SidebarNav inSheet={false} isAdmin={isAdmin} />
    </aside>
  )
}
