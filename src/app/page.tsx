import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center max-w-3xl">
        <Badge variant="secondary" className="mb-4">AI-Powered</Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          ContentGenie
        </h1>
        <p className="mt-6 text-lg leading-8 text-muted-foreground">
          Podcast summaries for busy professionals. Discover, summarize, and save
          podcast content with AI-powered insights.
        </p>
        <div className="mt-10 flex items-center justify-center gap-x-4">
          <Button asChild size="lg">
            <Link href="/discover">Discover Podcasts</Link>
          </Button>
          <Button variant="outline" asChild size="lg">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Summaries</CardTitle>
              <CardDescription>Get quick summaries of any podcast episode</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Save time with AI-generated summaries and key takeaways.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Smart Ratings</CardTitle>
              <CardDescription>Know what&apos;s worth your time</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                AI-powered &quot;worth it&quot; scores help you decide what to listen to.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Personal Library</CardTitle>
              <CardDescription>Organize and save your favorites</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Build your collection with notes and custom collections.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
