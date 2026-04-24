"use client";

import Link from "next/link";
import { SignedIn, UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Sidebar } from "@/components/layout/sidebar";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Logo } from "@/components/brand/logo";

export function AppHeader({ isAdmin }: { isAdmin: boolean }) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Mobile sheet — hamburger + full Sidebar nav */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mr-2 md:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="flex w-[280px] flex-col p-0 sm:w-[320px]"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar inSheet isAdmin={isAdmin} />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link
          href="/"
          className="mr-6 flex items-center gap-2"
          aria-label="ContentGenie home"
        >
          <Logo variant="mark" size={24} decorative />
          <span className="hidden font-bold sm:inline-block">ContentGenie</span>
        </Link>

        {/* Right side: theme, notifications, user */}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <SignedIn>
            <NotificationBell />
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
