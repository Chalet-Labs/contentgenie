import type { Meta, StoryObj } from "@storybook/react";

// Mock server actions and auth hooks for Storybook.
// Following the BulkResummarizeCard pattern: lightweight display components
// that mirror each visual state rather than wiring up real data dependencies.

const meta: Meta = {
  title: "Settings/MissingTranscriptsCard",
  parameters: {
    layout: "padded",
  },
};

export default meta;

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Loader2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

type Story = StoryObj;

// Shared podcast options used across stories
const PODCASTS = [
  { id: 1, value: "1", label: "The Daily" },
  { id: 2, value: "2", label: "Lex Fridman Podcast" },
  { id: 3, value: "3", label: "Hardcore History" },
];

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="secondary">Not attempted</Badge>;
  if (status === "missing") return <Badge variant="outline">Missing</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "fetching")
    return (
      <Badge variant="secondary" title="May be stale if the previous run crashed">
        Fetching... (stale?)
      </Badge>
    );
  return <Badge variant="outline">{status}</Badge>;
}

// Loading state — initial data fetch in progress
export const Loading: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Missing Transcripts</CardTitle>
          </div>
          <Button variant="ghost" size="sm" disabled aria-label="Refresh">
            <RefreshCw className="h-4 w-4 animate-spin" />
          </Button>
        </div>
        <CardDescription>Loading...</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select disabled>
              <SelectTrigger>
                <SelectValue placeholder="All podcasts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All podcasts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" disabled>
            <ChevronDown className="mr-1 h-4 w-4" />
            Show list
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
};

// Empty state — no episodes missing transcripts
export const Empty: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Missing Transcripts</CardTitle>
          </div>
          <Button variant="ghost" size="sm" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>0 episodes missing transcripts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select defaultValue="all">
              <SelectTrigger>
                <SelectValue placeholder="All podcasts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All podcasts</SelectItem>
                {PODCASTS.map((p) => (
                  <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" aria-expanded={true}>
            <ChevronUp className="mr-1 h-4 w-4" />
            Hide list
          </Button>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">No episodes with missing transcripts.</p>
        </div>
      </CardContent>
    </Card>
  ),
};

// Episodes list — various status badges, list expanded
export const WithEpisodes: Story = {
  render: () => {
    const episodes = [
      { id: 1, title: "AI Alignment and the Future of Intelligence", podcastTitle: "Lex Fridman Podcast", status: null, publishDate: "2024-03-15", error: null },
      { id: 2, title: "The War in Ukraine: Six Months In", podcastTitle: "The Daily", status: "missing", publishDate: "2024-02-20", error: null },
      { id: 3, title: "Blueprint for Armageddon Part I", podcastTitle: "Hardcore History", status: "failed", publishDate: "2024-01-10", error: "AssemblyAI quota exceeded" },
      { id: 4, title: "The Science of Sleep", podcastTitle: "The Daily", status: "fetching", publishDate: "2024-03-01", error: null },
    ];
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <CardTitle>Missing Transcripts</CardTitle>
            </div>
            <Button variant="ghost" size="sm" aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>4 episodes missing transcripts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue placeholder="All podcasts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All podcasts</SelectItem>
                  {PODCASTS.map((p) => (
                    <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" aria-expanded={true}>
              <ChevronUp className="mr-1 h-4 w-4" />
              Hide list
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug truncate" title={ep.title}>
                      {ep.title}
                    </p>
                    <p className="text-muted-foreground truncate">{ep.podcastTitle}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={ep.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(ep.publishDate).toLocaleDateString()}
                      </span>
                    </div>
                    {ep.error && (
                      <p className="text-xs text-destructive truncate" title={ep.error}>
                        {ep.error}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0">
                    Fetch
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm">
                Fetch All (4)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
};

// Podcast filter active — showing only one podcast's episodes
export const WithPodcastFilter: Story = {
  render: () => {
    const episodes = [
      { id: 2, title: "The War in Ukraine: Six Months In", podcastTitle: "The Daily", status: "missing", publishDate: "2024-02-20", error: null },
      { id: 4, title: "The Science of Sleep", podcastTitle: "The Daily", status: "fetching", publishDate: "2024-03-01", error: null },
    ];
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <CardTitle>Missing Transcripts</CardTitle>
            </div>
            <Button variant="ghost" size="sm" aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>2 episodes missing transcripts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select defaultValue="1">
                <SelectTrigger>
                  <SelectValue placeholder="All podcasts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All podcasts</SelectItem>
                  {PODCASTS.map((p) => (
                    <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" aria-expanded={true}>
              <ChevronUp className="mr-1 h-4 w-4" />
              Hide list
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug truncate">{ep.title}</p>
                    <p className="text-muted-foreground truncate">{ep.podcastTitle}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={ep.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(ep.publishDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0">
                    Fetch
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm">
                Fetch All (2)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
};

// Fetch in progress — single row fetching, buttons disabled
export const FetchInProgress: Story = {
  render: () => {
    const episodes = [
      { id: 1, title: "AI Alignment and the Future of Intelligence", podcastTitle: "Lex Fridman Podcast", status: "fetching", publishDate: "2024-03-15", error: null },
      { id: 2, title: "The War in Ukraine: Six Months In", podcastTitle: "The Daily", status: "missing", publishDate: "2024-02-20", error: null },
    ];
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <CardTitle>Missing Transcripts</CardTitle>
            </div>
            <Button variant="ghost" size="sm" aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>2 episodes missing transcripts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue placeholder="All podcasts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All podcasts</SelectItem>
                  {PODCASTS.map((p) => (
                    <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" aria-expanded={true}>
              <ChevronUp className="mr-1 h-4 w-4" />
              Hide list
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {episodes.map((ep, i) => (
                <div
                  key={ep.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug truncate">{ep.title}</p>
                    <p className="text-muted-foreground truncate">{ep.podcastTitle}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={ep.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(ep.publishDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {/* First row is actively fetching */}
                  <Button variant="outline" size="sm" disabled={i === 0} className="shrink-0">
                    {i === 0 ? <Loader2 className="h-3 w-3 animate-spin" /> : "Fetch"}
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm">
                Fetch All (2)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
};

// Batch fetch in progress — Fetch All button in loading state, all rows disabled
export const BatchFetchInProgress: Story = {
  render: () => {
    const episodes = [
      { id: 1, title: "AI Alignment and the Future of Intelligence", podcastTitle: "Lex Fridman Podcast", status: null, publishDate: "2024-03-15" },
      { id: 2, title: "The War in Ukraine: Six Months In", podcastTitle: "The Daily", status: "missing", publishDate: "2024-02-20" },
      { id: 3, title: "Blueprint for Armageddon Part I", podcastTitle: "Hardcore History", status: "failed", publishDate: "2024-01-10" },
    ];
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <CardTitle>Missing Transcripts</CardTitle>
            </div>
            <Button variant="ghost" size="sm" aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>3 episodes missing transcripts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue placeholder="All podcasts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All podcasts</SelectItem>
                  {PODCASTS.map((p) => (
                    <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" aria-expanded={true}>
              <ChevronUp className="mr-1 h-4 w-4" />
              Hide list
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug truncate">{ep.title}</p>
                    <p className="text-muted-foreground truncate">{ep.podcastTitle}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={ep.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(ep.publishDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" disabled className="shrink-0">
                    Fetch
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="default" size="sm" disabled>
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                Fetching...
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
};

// Error state — failed to load episodes
export const ErrorState: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Missing Transcripts</CardTitle>
          </div>
          <Button variant="ghost" size="sm" aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>0 episodes missing transcripts</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Select defaultValue="all">
              <SelectTrigger>
                <SelectValue placeholder="All podcasts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All podcasts</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" aria-expanded={true}>
            <ChevronUp className="mr-1 h-4 w-4" />
            Hide list
          </Button>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-destructive">Failed to load episodes. Try refreshing.</p>
        </div>
      </CardContent>
    </Card>
  ),
};

// Load More — pagination visible when there are more pages
export const WithLoadMore: Story = {
  render: () => {
    const episodes = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Episode ${i + 1}: Some Long Podcast Title That Gets Truncated`,
      podcastTitle: PODCASTS[i % PODCASTS.length].label,
      status: (["missing", "failed", "fetching", null] as const)[i % 4],
      publishDate: `2024-0${(i % 9) + 1}-01`,
      error: null,
    }));
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <CardTitle>Missing Transcripts</CardTitle>
            </div>
            <Button variant="ghost" size="sm" aria-label="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>47 episodes missing transcripts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Select defaultValue="all">
                <SelectTrigger>
                  <SelectValue placeholder="All podcasts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All podcasts</SelectItem>
                  {PODCASTS.map((p) => (
                    <SelectItem key={p.id} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" aria-expanded={true}>
              <ChevronUp className="mr-1 h-4 w-4" />
              Hide list
            </Button>
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              {episodes.map((ep) => (
                <div
                  key={ep.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium leading-snug truncate">{ep.title}</p>
                    <p className="text-muted-foreground truncate">{ep.podcastTitle}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={ep.status} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(ep.publishDate).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0">
                    Fetch
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                Load More
              </Button>
              <Button variant="default" size="sm">
                Fetch All (10)
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  },
};
