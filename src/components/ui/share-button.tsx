"use client";

import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ShareButtonProps {
  title: string;
  text?: string;
  url: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function ShareButton({
  title,
  text,
  url,
  size = "lg",
  variant = "outline",
}: ShareButtonProps) {
  const handleShare = async () => {
    const shareData = { title, text, url };

    // Try Web Share API first (mobile/PWA)
    if (navigator.share) {
      try {
        if (!navigator.canShare || navigator.canShare(shareData)) {
          await navigator.share(shareData);
          return;
        }
      } catch (error) {
        // User cancelled — silently ignore
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Other errors fall through to clipboard
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      // Final fallback — show URL in toast so user can copy manually
      toast("Could not copy link", { description: url });
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleShare}>
      <Share2 className="mr-2" />
      Share
    </Button>
  );
}
