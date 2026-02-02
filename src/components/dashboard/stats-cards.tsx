"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Rss, Bookmark, TrendingUp, Library } from "lucide-react";

interface StatsCardsProps {
  subscriptionCount: number;
  savedCount: number;
  isLoading?: boolean;
}

export function StatsCards({ subscriptionCount, savedCount, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Link href="/subscriptions">
        <Card className="transition-colors hover:bg-accent">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Subscriptions
                </p>
                <p className="mt-1 text-2xl font-bold">{subscriptionCount}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <Rss className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href="/library">
        <Card className="transition-colors hover:bg-accent">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Saved Episodes
                </p>
                <p className="mt-1 text-2xl font-bold">{savedCount}</p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <Bookmark className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href="/discover">
        <Card className="transition-colors hover:bg-accent">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Discover
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Find new podcasts
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href="/library">
        <Card className="transition-colors hover:bg-accent">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Library
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manage your content
                </p>
              </div>
              <div className="rounded-full bg-primary/10 p-3">
                <Library className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
