import Link from "next/link";
import { Headphones, Search, Rss, Library } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

export function WelcomeCard() {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="mx-auto max-w-md text-center">
          <div className="mx-auto mb-4">
            <Logo variant="mark" size={56} decorative />
          </div>
          <h2 className="text-xl font-semibold tracking-tight">
            Welcome to ContentGenie
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Find podcasts, get AI-powered summaries, and build your personal
            library of episodes worth your time.
          </p>
          <Button asChild size="lg" className="mt-6">
            <Link href="/discover">
              <Search className="mr-2 h-4 w-4" />
              Discover Podcasts
            </Link>
          </Button>
          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Rss className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Subscribe to podcasts
              </p>
            </div>
            <div>
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Headphones className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Get AI summaries
              </p>
            </div>
            <div>
              <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                <Library className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                Build your library
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
