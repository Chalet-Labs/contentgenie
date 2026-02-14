"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/podcasts/search-results";
import { RssFeedForm } from "@/components/podcasts/rss-feed-form";
import type { PodcastSearchResult } from "@/lib/podcastindex";

export function DiscoverContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get("q") ?? "";

  const [searchQuery, setSearchQuery] = useState(urlQuery);
  const [podcasts, setPodcasts] = useState<PodcastSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSearchQuery(urlQuery);

    if (!urlQuery.trim()) {
      setIsLoading(false);
      setPodcasts([]);
      setError(null);
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/podcasts/search?q=${encodeURIComponent(urlQuery)}&max=20`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to search podcasts");
        }

        const data = await response.json();
        setPodcasts(data.podcasts || []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error("Search error:", err);
        setError(
          err instanceof Error ? err.message : "Failed to search podcasts"
        );
        setPodcasts([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => controller.abort();
  }, [urlQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    router.replace(
      trimmed ? `/discover?q=${encodeURIComponent(trimmed)}` : "/discover"
    );
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search podcasts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Searching..." : "Search"}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">
            or add by RSS feed
          </span>
        </div>
      </div>

      <RssFeedForm />

      <SearchResults
        podcasts={podcasts}
        isLoading={isLoading}
        error={error}
        query={urlQuery}
      />
    </>
  );
}
