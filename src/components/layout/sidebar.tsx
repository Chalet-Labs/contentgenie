"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Search,
  Rss,
  Library,
  Settings,
  Shield,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useSidebarCountsOptional,
  getBadgeCount,
  NavBadge,
} from "@/contexts/sidebar-counts-context";
import { usePinnedSubscriptionsOptional } from "@/contexts/pinned-subscriptions-context";
import { PinnedSubscriptionsSection } from "@/components/layout/pinned-subscriptions-section";
import { MaybeSheetClose } from "@/components/layout/maybe-sheet-close";

const sidebarLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/subscriptions", label: "Subscriptions", icon: Rss },
  { href: "/library", label: "Library", icon: Library },
];

const bottomLinks = [{ href: "/settings", label: "Settings", icon: Settings }];

export const PINNED_EXPANDED_STORAGE_KEY = "sidebar:pinned-expanded";
export const PINNED_EXPANDED_STORAGE_VALUE = "1";

function readPinnedExpanded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      localStorage.getItem(PINNED_EXPANDED_STORAGE_KEY) ===
      PINNED_EXPANDED_STORAGE_VALUE
    );
  } catch {
    return false;
  }
}

function writePinnedExpanded(next: boolean): void {
  try {
    if (next) {
      localStorage.setItem(
        PINNED_EXPANDED_STORAGE_KEY,
        PINNED_EXPANDED_STORAGE_VALUE,
      );
    } else {
      localStorage.removeItem(PINNED_EXPANDED_STORAGE_KEY);
    }
  } catch {
    // localStorage may be unavailable (e.g. private browsing quota exceeded)
  }
}

function SidebarNav({
  inSheet,
  isAdmin,
}: {
  inSheet: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const counts = useSidebarCountsOptional();
  const { pinned } = usePinnedSubscriptionsOptional();

  const [pinnedExpanded, setPinnedExpanded] = useState(false);

  useEffect(() => {
    setPinnedExpanded(readPinnedExpanded());
  }, []);

  const togglePinned = () => {
    const next = !pinnedExpanded;
    setPinnedExpanded(next);
    writePinnedExpanded(next);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {sidebarLinks.map((link) => {
            const Icon = link.icon;
            const isActive =
              pathname === link.href || pathname?.startsWith(`${link.href}/`);
            const badge = getBadgeCount(link.href, counts);

            if (link.href === "/subscriptions") {
              return (
                <div key={link.href}>
                  <div className="flex items-center gap-1">
                    <MaybeSheetClose inSheet={inSheet}>
                      <Link
                        href={link.href}
                        className={cn(
                          "flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-accent text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {link.label}
                        {badge !== null && <NavBadge count={badge} />}
                      </Link>
                    </MaybeSheetClose>
                    {pinned.length > 0 && (
                      <button
                        type="button"
                        aria-label="Toggle pinned podcasts"
                        aria-expanded={pinnedExpanded}
                        onClick={togglePinned}
                        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        {pinnedExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {pinnedExpanded && pinned.length > 0 && (
                    <PinnedSubscriptionsSection inSheet={inSheet} />
                  )}
                </div>
              );
            }

            return (
              <MaybeSheetClose key={link.href} inSheet={inSheet}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                  {badge !== null && <NavBadge count={badge} />}
                </Link>
              </MaybeSheetClose>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t py-4">
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
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <MaybeSheetClose key={link.href} inSheet={inSheet}>
                <Link
                  href={link.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </Link>
              </MaybeSheetClose>
            );
          })}
          {isAdmin && (
            <MaybeSheetClose inSheet={inSheet}>
              <Link
                href="/admin"
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  pathname === "/admin" || pathname?.startsWith("/admin/")
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
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
  );
}

export function Sidebar({
  inSheet = false,
  isAdmin,
}: {
  inSheet?: boolean;
  isAdmin: boolean;
}) {
  if (inSheet) {
    return <SidebarNav inSheet isAdmin={isAdmin} />;
  }

  return (
    <aside className="hidden h-[calc(100vh-3.5rem)] w-64 flex-col border-r bg-background md:flex">
      <SidebarNav inSheet={false} isAdmin={isAdmin} />
    </aside>
  );
}
