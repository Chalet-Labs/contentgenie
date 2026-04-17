"use client"

import Link from "next/link"
import { SignedIn, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Menu, Headphones } from "lucide-react"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { Sidebar } from "@/components/layout/sidebar"
import { ThemeToggle } from "@/components/layout/theme-toggle"

export function AppHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Mobile sheet — hamburger + full Sidebar nav */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden mr-2"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Sidebar inSheet />
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-6">
          <Headphones className="h-6 w-6" />
          <span className="font-bold hidden sm:inline-block">ContentGenie</span>
        </Link>

        {/* Right side: theme, notifications, user */}
        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />
          <SignedIn>
            <NotificationBell />
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  )
}
