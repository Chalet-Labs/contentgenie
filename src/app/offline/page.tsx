import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RetryButton } from "@/app/offline/retry-button";

export const metadata: Metadata = {
  title: "Offline",
};

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <WifiOff className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">You are offline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            ContentGenie needs an internet connection to load podcasts and
            summaries. Check your connection and retry.
          </p>
          <RetryButton />
        </CardContent>
      </Card>
    </div>
  );
}
