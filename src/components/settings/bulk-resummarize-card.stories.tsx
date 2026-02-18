import type { Meta, StoryObj } from "@storybook/react";

// Mock server action and trigger hooks for Storybook
const meta: Meta = {
  title: "Settings/BulkResummarizeCard",
  parameters: {
    layout: "padded",
  },
};

export default meta;

// Since BulkResummarizeCard uses server actions and realtime hooks that are
// hard to mock at the Storybook story level, we create lightweight display
// components that mirror each state for visual testing.

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, CheckCircle2, XCircle } from "lucide-react";

type Story = StoryObj;

// Idle state — filter form, no filter selected (button disabled)
export const Idle: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Podcast</label>
            <select className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">All podcasts</option>
              <option value="1">The Daily</option>
              <option value="2">Lex Fridman Podcast</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max quality score</label>
            <Input
              type="number"
              min={0}
              max={10}
              placeholder="e.g. 5 (re-summarize low scores)"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Published after</label>
            <Input type="date" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Published before</label>
            <Input type="date" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="all-episodes-idle"
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="all-episodes-idle" className="text-sm font-medium">
            Re-summarize all episodes
          </label>
        </div>
        <Button disabled>
          <Sparkles className="mr-2 h-4 w-4" />
          Re-Summarize
        </Button>
      </CardContent>
    </Card>
  ),
};

// Idle state — filter selected (button enabled)
export const IdleWithFilter: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Podcast</label>
            <select className="w-full rounded-md border px-3 py-2 text-sm">
              <option value="">All podcasts</option>
              <option value="1" selected>The Daily</option>
              <option value="2">Lex Fridman Podcast</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max quality score</label>
            <Input
              type="number"
              min={0}
              max={10}
              placeholder="e.g. 5 (re-summarize low scores)"
              defaultValue={5}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Published after</label>
            <Input type="date" defaultValue="2024-01-01" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Published before</label>
            <Input type="date" defaultValue="2024-12-31" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="all-episodes-filter"
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="all-episodes-filter" className="text-sm font-medium">
            Re-summarize all episodes
          </label>
        </div>
        <Button>
          <Sparkles className="mr-2 h-4 w-4" />
          Re-Summarize
        </Button>
      </CardContent>
    </Card>
  ),
};

// Confirming (estimating episode count)
export const Estimating: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max quality score</label>
            <Input type="number" defaultValue={5} disabled />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="all-episodes-est"
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="all-episodes-est" className="text-sm font-medium">
            Re-summarize all episodes
          </label>
        </div>
        <Button disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Checking...
        </Button>
      </CardContent>
    </Card>
  ),
};

// Processing state — with real-time progress
export const Processing: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3" role="status" aria-live="polite">
          <Progress
            value={(47 / 120) * 100}
            className="h-2"
            aria-label="Bulk re-summarization progress"
          />
          <p className="text-sm text-muted-foreground">
            47 of 120 completed
            <span className="text-amber-500">, 3 failed</span>
          </p>
          <Button variant="outline" size="sm">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
};

// Processing state — no failures
export const ProcessingNoFailures: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3" role="status" aria-live="polite">
          <Progress
            value={(250 / 500) * 100}
            className="h-2"
            aria-label="Bulk re-summarization progress"
          />
          <p className="text-sm text-muted-foreground">
            250 of 500 completed
          </p>
          <Button variant="outline" size="sm">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  ),
};

// Done state — success
export const Done: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2" aria-live="polite">
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">
            117 re-summarized, 3 failed
          </span>
        </div>
      </CardContent>
    </Card>
  ),
};

// Done state — all succeeded
export const DoneAllSucceeded: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2" aria-live="polite">
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">
            120 re-summarized
          </span>
        </div>
      </CardContent>
    </Card>
  ),
};

// Error state — API failure
export const Error: Story = {
  render: () => (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Summaries
        </CardTitle>
        <CardDescription>
          Re-generate AI summaries for your episodes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Max quality score</label>
            <Input type="number" defaultValue={5} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="all-episodes-error"
            className="h-4 w-4 rounded border-gray-300"
          />
          <label htmlFor="all-episodes-error" className="text-sm font-medium">
            Re-summarize all episodes
          </label>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-live="assertive"
        >
          <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />
          <span className="text-sm text-destructive">
            Rate limit exceeded. Only 1 bulk re-summarization per hour.
          </span>
          <Button variant="outline" size="sm" type="button">
            Clear
          </Button>
        </div>
        <Button>
          <Sparkles className="mr-2 h-4 w-4" />
          Re-Summarize
        </Button>
      </CardContent>
    </Card>
  ),
};
