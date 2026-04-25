import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BookMarked, CheckCircle, Sparkles } from "lucide-react";
import {
  EpisodeTabs,
  EpisodeTabsContent,
  EpisodeTabsList,
  EpisodeTabsTrigger,
} from "@/components/episodes/episode-tabs";

const meta: Meta<typeof EpisodeTabs> = {
  title: "Episodes/EpisodeTabs",
  component: EpisodeTabs,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-3xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof EpisodeTabs>;

function InsightsPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">AI-Powered Insights</h2>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-[hsl(var(--status-success-bg))] text-xl font-bold tabular-nums text-[hsl(var(--status-success-text))]">
            7.2
          </div>
          <div>
            <div className="font-semibold">Above average</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Strong specific interview tactics; second half drags into anecdote
              territory.
            </p>
          </div>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Key takeaways</h3>
        </div>
        <ol className="mt-3 space-y-3 text-sm">
          <li>
            Frameworks are training wheels — high-judgment teams discard them.
          </li>
          <li>Interview for taste by asking what work they&apos;d redo.</li>
          <li>
            Onboarding into taste = exposure + critique, not documentation.
          </li>
        </ol>
      </div>
    </div>
  );
}

function ChaptersPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookMarked className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Chapters</h3>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {[
          { t: "0:00", title: "Cold open & intros" },
          { t: "5:12", title: "The trap of over-frameworking", active: true },
          { t: "15:34", title: "Taste as a team asset" },
          { t: "30:20", title: "Hiring for judgment" },
          { t: "44:10", title: "Listener questions" },
          { t: "56:40", title: "Wrap + next week" },
        ].map((c, i) => (
          <li key={i}>
            <button
              type="button"
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${
                c.active ? "bg-primary/[0.08] text-primary" : ""
              }`}
            >
              <span
                className={`w-12 shrink-0 text-xs font-medium tabular-nums ${c.active ? "text-primary" : "text-muted-foreground"}`}
              >
                {c.t}
              </span>
              <span
                className={`flex-1 text-sm ${c.active ? "font-medium text-primary" : ""}`}
              >
                {c.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AboutPanel() {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <h2 className="mb-3 text-lg font-semibold">About This Episode</h2>
      <p className="text-sm text-muted-foreground">
        Debbie and guest Julie Zhuo unpack why senior designers stop reaching
        for frameworks and start trusting the room. Topics: the Jobs-to-be-Done
        trap, taste as a hireable skill, and how to onboard someone into your
        team&apos;s aesthetic without giving them a checklist.
      </p>
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <EpisodeTabs defaultValue="insights">
      <EpisodeTabsList aria-label="Episode sections">
        <EpisodeTabsTrigger value="insights">Insights</EpisodeTabsTrigger>
        <EpisodeTabsTrigger value="chapters" badge={6}>
          Chapters
        </EpisodeTabsTrigger>
        <EpisodeTabsTrigger value="about">About</EpisodeTabsTrigger>
      </EpisodeTabsList>
      <EpisodeTabsContent value="insights">
        <InsightsPanel />
      </EpisodeTabsContent>
      <EpisodeTabsContent value="chapters">
        <ChaptersPanel />
      </EpisodeTabsContent>
      <EpisodeTabsContent value="about">
        <AboutPanel />
      </EpisodeTabsContent>
    </EpisodeTabs>
  ),
};

export const NoChapters: Story = {
  name: "No Chapters (two-tab variant)",
  render: () => (
    <EpisodeTabs defaultValue="insights">
      <EpisodeTabsList aria-label="Episode sections">
        <EpisodeTabsTrigger value="insights">Insights</EpisodeTabsTrigger>
        <EpisodeTabsTrigger value="about">About</EpisodeTabsTrigger>
      </EpisodeTabsList>
      <EpisodeTabsContent value="insights">
        <InsightsPanel />
      </EpisodeTabsContent>
      <EpisodeTabsContent value="about">
        <AboutPanel />
      </EpisodeTabsContent>
    </EpisodeTabs>
  ),
};

export const ChaptersActive: Story = {
  name: "Chapters Tab Active",
  render: () => (
    <EpisodeTabs defaultValue="chapters">
      <EpisodeTabsList aria-label="Episode sections">
        <EpisodeTabsTrigger value="insights">Insights</EpisodeTabsTrigger>
        <EpisodeTabsTrigger value="chapters" badge={6}>
          Chapters
        </EpisodeTabsTrigger>
        <EpisodeTabsTrigger value="about">About</EpisodeTabsTrigger>
      </EpisodeTabsList>
      <EpisodeTabsContent value="insights">
        <InsightsPanel />
      </EpisodeTabsContent>
      <EpisodeTabsContent value="chapters">
        <ChaptersPanel />
      </EpisodeTabsContent>
      <EpisodeTabsContent value="about">
        <AboutPanel />
      </EpisodeTabsContent>
    </EpisodeTabs>
  ),
};
