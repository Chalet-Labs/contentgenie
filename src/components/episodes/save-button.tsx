"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { saveEpisodeToLibrary, removeEpisodeFromLibrary } from "@/app/actions/library";

interface EpisodeData {
  podcastIndexId: string;
  title: string;
  description?: string;
  audioUrl?: string;
  duration?: number;
  publishDate?: Date;
  podcast: {
    podcastIndexId: string;
    title: string;
    description?: string;
    publisher?: string;
    imageUrl?: string;
    rssFeedUrl?: string;
    categories?: string[];
    totalEpisodes?: number;
  };
}

interface SaveButtonProps {
  episodeData: EpisodeData;
  initialSaved?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function SaveButton({
  episodeData,
  initialSaved = false,
  size = "default",
  variant = "outline",
}: SaveButtonProps) {
  const [isSaved, setIsSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    startTransition(async () => {
      if (isSaved) {
        const result = await removeEpisodeFromLibrary(episodeData.podcastIndexId);
        if (result.success) {
          setIsSaved(false);
        }
      } else {
        const result = await saveEpisodeToLibrary(episodeData);
        if (result.success) {
          setIsSaved(true);
        }
      }
    });
  };

  return (
    <Button
      variant={isSaved ? "secondary" : variant}
      size={size}
      onClick={handleToggle}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : isSaved ? (
        <BookmarkCheck className="mr-2 h-4 w-4" />
      ) : (
        <Bookmark className="mr-2 h-4 w-4" />
      )}
      {isSaved ? "Saved" : "Save"}
    </Button>
  );
}
