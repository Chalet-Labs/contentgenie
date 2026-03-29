"use client";

import { Share2, Link, FileText, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ShareButtonProps {
  title: string;
  text?: string;
  url: string;
  summary?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
}

export function ShareButton({
  title,
  text,
  url,
  summary,
  size = "lg",
  variant = "outline",
}: ShareButtonProps) {
  const supportsNativeShare =
    typeof navigator !== "undefined" && !!navigator.share;

  const formatShareText = () => {
    if (summary) {
      return `${title}\n\n${summary}\n\n${url}`;
    }
    return `${title}\n\n${url}`;
  };

  const handleNativeShare = async () => {
    const shareData = { title, text: text ?? title, url };
    try {
      if (!navigator.canShare || navigator.canShare(shareData)) {
        await navigator.share(shareData);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      // Fall through silently — user can still use copy options
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard");
    } catch {
      toast("Could not copy link", { description: url });
    }
  };

  const handleCopyWithSummary = async () => {
    const formatted = formatShareText();
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success("Copied to clipboard");
    } catch {
      toast("Could not copy text", { description: url });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size}>
          <Share2 className="mr-2" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {supportsNativeShare && (
          <DropdownMenuItem onClick={handleNativeShare}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Share
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleCopyLink}>
          <Link className="mr-2 h-4 w-4" />
          Copy link
        </DropdownMenuItem>
        {summary && (
          <DropdownMenuItem onClick={handleCopyWithSummary}>
            <FileText className="mr-2 h-4 w-4" />
            Copy with summary
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
