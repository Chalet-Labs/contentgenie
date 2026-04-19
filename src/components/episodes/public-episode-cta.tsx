"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

interface PublicEpisodeCTAProps {
  href: string;
}

export function PublicEpisodeCTA({ href }: PublicEpisodeCTAProps) {
  return (
    <div className="sticky top-16 z-40 rounded-xl border bg-background/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Enjoying this?</p>
          <p className="text-sm text-muted-foreground">
            Sign up to save episodes and discover more.
          </p>
        </div>
        <Button asChild>
          <Link href={href}>Sign Up</Link>
        </Button>
      </div>
    </div>
  );
}
