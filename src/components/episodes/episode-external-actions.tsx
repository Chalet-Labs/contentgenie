import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ShareButton } from "@/components/ui/share-button";

interface EpisodeExternalActionsProps {
  episodeId: string;
  episodeTitle: string;
  safeEpisodeLink: string | null | undefined;
  shareSummary?: string;
}

export function EpisodeExternalActions({
  episodeId,
  episodeTitle,
  safeEpisodeLink,
  shareSummary,
}: EpisodeExternalActionsProps) {
  return (
    <>
      {safeEpisodeLink && (
        <Button variant="outline" size="lg" asChild>
          <a href={safeEpisodeLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Episode Page
          </a>
        </Button>
      )}
      {process.env.NEXT_PUBLIC_APP_URL && (
        <ShareButton
          title={episodeTitle}
          text={episodeTitle}
          url={`${process.env.NEXT_PUBLIC_APP_URL}/episode/${encodeURIComponent(episodeId)}`}
          summary={shareSummary}
          size="lg"
        />
      )}
    </>
  );
}
