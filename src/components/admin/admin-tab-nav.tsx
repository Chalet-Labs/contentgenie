"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const tabs = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/settings", label: "Settings", exact: false },
  { href: "/admin/episodes", label: "Episodes", exact: false },
]

export function AdminTabNav() {
  const pathname = usePathname()

  return (
    <nav className="flex gap-1 border-b pb-0">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname === tab.href || pathname?.startsWith(tab.href + "/")

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
