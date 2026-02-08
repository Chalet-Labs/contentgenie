"use client";

import { useState, useCallback } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchResults } from "@/components/podcasts/search-results";
import { RssFeedForm } from "@/components/podcasts/rss-feed-form";
import type { PodcastIndexPodcast } from "@/lib/podcastindex";

export default function DiscoverPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [podcasts, setPodcasts] = useState<PodcastIndexPodcast[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setPodcasts([]);
      setSubmittedQuery("");
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSubmittedQuery(query);

    try {
      const response = await fetch(
        `/api/podcasts/search?q=${encodeURIComponent(query)}&max=20`
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to search podcasts");
      }

      const data = await response.json();
      setPodcasts(data.podcasts || []);
    } catch (err) {
      console.error("Search error:", err);
      setError(err instanceof Error ? err.message : "Failed to search podcasts");
      setPodcasts([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch(searchQuery);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Discover</h1>
        <p className="text-muted-foreground">
          Search and explore podcasts to find your next favorite show.
        </p>
      </div>

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
        query={submittedQuery}
      />
    </div>
  );
}
