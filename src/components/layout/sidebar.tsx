"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher } from "@clerk/nextjs"
import { useAuth } from "@clerk/nextjs"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Search,
  Rss,
  Library,
  Settings,
  Shield,
} from "lucide-react"
import { useSidebarCounts, getBadgeCount, NavBadge } from "@/contexts/sidebar-counts-context"
import { ADMIN_ROLE } from "@/lib/auth-roles"

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/subscriptions", label: "Subscriptions", icon: Rss },
  { href: "/library", label: "Library", icon: Library },
]

const bottomLinks = [
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const counts = useSidebarCounts()
  const { has } = useAuth()
  const isAdmin = has?.({ role: ADMIN_ROLE }) ?? false

  return (
    <aside className="hidden lg:flex flex-col w-64 border-r bg-background h-[calc(100vh-3.5rem)]">
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {sidebarLinks.map((link) => {
            const Icon = link.icon
            const isActive = pathname === link.href || pathname?.startsWith(`${link.href}/`)

            const badge = getBadgeCount(link.href, counts)

            return (
              <Link
                key={link.href}
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
              <Link
                key={link.href}
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
            )
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                pathname === "/admin" || pathname?.startsWith("/admin/")
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Shield className="size-4" />
              Admin
            </Link>
          )}
        </nav>
      </div>
    </aside>
  )
}
