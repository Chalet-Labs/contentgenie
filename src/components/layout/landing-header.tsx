"use client"

import Link from "next/link"
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Headphones } from "lucide-react"
import { ThemeToggle } from "@/components/layout/theme-toggle"

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <Link href="/" className="flex items-center gap-2 mr-6">
          <Headphones className="h-6 w-6" />
          <span className="font-bold hidden sm:inline-block">ContentGenie</span>
        </Link>

        <div className="flex items-center gap-2 ml-auto">
          <ThemeToggle />
          <SignedIn>
            <UserButton />
          </SignedIn>
          <SignedOut>
            <div className="flex gap-2">
              <SignInButton>
                <Button variant="ghost" size="sm">
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton>
                <Button size="sm">Sign Up</Button>
              </SignUpButton>
            </div>
          </SignedOut>
        </div>
      </div>
    </header>
  )
}
