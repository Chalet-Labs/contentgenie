"use client";

import "@/components/layout/marketing-header.css";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ContrastButton } from "@/components/landing/contrast-button";

export function MarketingHeader() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme === "dark";

  return (
    <header className="lp-hdr">
      <div className="lp-container lp-hdr-inner">
        <Link href="/" className="lp-brand">
          <div className="lp-brand-mark">C</div>
          <span>ContentGenie</span>
        </Link>
        <nav className="lp-nav">
          <Link href="/#product">Product</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/#example">Example</Link>
          <Link href="/#pricing">Pricing</Link>
        </nav>
        <div className="lp-hdr-actions">
          <Button
            variant="ghost"
            size="icon"
            disabled={!mounted}
            onClick={() => {
              if (!mounted) return;
              setTheme(isDark ? "light" : "dark");
            }}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {mounted ? (isDark ? <Sun /> : <Moon />) : null}
          </Button>
          <SignedOut>
            <SignInButton>
              <Button variant="ghost">Sign in</Button>
            </SignInButton>
            <SignUpButton>
              <ContrastButton>Join beta</ContrastButton>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <ContrastButton asChild>
              <Link href="/dashboard">Open app</Link>
            </ContrastButton>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
