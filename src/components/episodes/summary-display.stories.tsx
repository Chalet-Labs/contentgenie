import type { Meta, StoryObj } from "@storybook/react";
import { SummaryDisplay } from "./summary-display";

const meta: Meta<typeof SummaryDisplay> = {
  title: "Episodes/SummaryDisplay",
  component: SummaryDisplay,
};

export default meta;
type Story = StoryObj<typeof SummaryDisplay>;

export const Loading: Story = {
  args: {
    summary: null,
    keyTakeaways: null,
    worthItScore: null,
    isLoading: true,
  },
};

export const Error: Story = {
  args: {
    summary: null,
    keyTakeaways: null,
    worthItScore: null,
    error: "Failed to connect to AI service. Please try again later.",
    onGenerateSummary: () => {},
  },
};

export const NoSummary: Story = {
  args: {
    summary: null,
    keyTakeaways: null,
    worthItScore: null,
    onGenerateSummary: () => {},
  },
};

export const FullSummary: Story = {
  args: {
    summary:
      "This episode dives deep into the latest advancements in AI-powered tools for content creators. The hosts discuss practical applications of large language models in everyday workflows, interview a startup founder building AI tools for podcasters, and share their predictions for the future of content creation.",
    keyTakeaways: [
      "AI tools can reduce podcast editing time by up to 60%",
      "Content creators should focus on authenticity rather than trying to replace themselves with AI",
      "The most successful AI implementations enhance human creativity rather than replace it",
      "Emerging transcription tools achieve 98%+ accuracy for most English content",
    ],
    worthItScore: 8.5,
    worthItReason:
      "Excellent deep dive into practical AI applications with actionable insights for content creators.",
  },
};

export const LongSummary: Story = {
  args: {
    summary: "A".repeat(700) + " This is the end of a very long summary.",
    keyTakeaways: ["First point", "Second point"],
    worthItScore: 6.0,
    worthItReason: "Average content with some useful insights.",
  },
};

export const LowScore: Story = {
  args: {
    summary: "A short, unimpressive episode with recycled content.",
    keyTakeaways: ["One minor point"],
    worthItScore: 2.5,
    worthItReason: "Limited value — mostly rehashed material from other episodes.",
  },
};

export const WithSignals: Story = {
  args: {
    summary:
      "This episode dives deep into the latest advancements in AI-powered tools for content creators.",
    keyTakeaways: [
      "AI tools can reduce podcast editing time by up to 60%",
      "Content creators should focus on authenticity",
      "Emerging transcription tools achieve 98%+ accuracy",
    ],
    worthItScore: 7,
    worthItReason:
      "5/8 signals: actionable insights, near-term applicability, focused, beyond surface, well-structured. Adjustment: +1 (exceptional guest lineup).",
    worthItDimensions: {
      kind: "signals",
      signals: {
        hasActionableInsights: true,
        hasNearTermApplicability: true,
        staysFocused: true,
        goesBeyondSurface: true,
        isWellStructured: true,
        timeJustified: false,
        hasConcreteExamples: false,
        hasExpertPerspectives: false,
      },
      adjustment: 1,
      adjustmentReason:
        "Exceptional guest lineup elevates the content beyond the checklist.",
    },
  },
};

export const WithLegacyDimensions: Story = {
  args: {
    ...FullSummary.args,
    worthItDimensions: {
      kind: "dimensions",
      uniqueness: 8,
      actionability: 7,
      timeValue: 9,
    },
  },
};
