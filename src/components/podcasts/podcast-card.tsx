"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PodcastIndexPodcast } from "@/lib/podcastindex";

interface PodcastCardProps {
  podcast: PodcastIndexPodcast;
}

export function PodcastCard({ podcast }: PodcastCardProps) {
  const categories = podcast.categories
    ? Object.values(podcast.categories).slice(0, 3)
    : [];

  return (
    <Link href={`/podcast/${podcast.id}`}>
      <Card className="group h-full overflow-hidden transition-colors hover:bg-accent">
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
              {podcast.artwork || podcast.image ? (
                <Image
                  src={podcast.artwork || podcast.image}
                  alt={podcast.title}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="23" />
                    <line x1="8" x2="16" y1="23" y2="23" />
                  </svg>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <h3 className="line-clamp-1 font-semibold group-hover:text-primary">
                {podcast.title}
              </h3>
              <p className="line-clamp-1 text-sm text-muted-foreground">
                {podcast.author || podcast.ownerName || "Unknown author"}
              </p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {podcast.description
                  ? stripHtml(podcast.description)
                  : "No description available"}
              </p>
              <div className="mt-auto flex items-center gap-2 pt-2">
                {categories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {categories.map((category, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {category}
                      </Badge>
                    ))}
                  </div>
                )}
                {podcast.episodeCount > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {podcast.episodeCount} episodes
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}
