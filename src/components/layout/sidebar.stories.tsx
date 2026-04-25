import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import { SidebarCountsProvider } from "@/contexts/sidebar-counts-context";
import { PinnedSubscriptionsProvider } from "@/contexts/pinned-subscriptions-context";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  PINNED_EXPANDED_STORAGE_NAME,
  PINNED_EXPANDED_STORAGE_VALUE,
  Sidebar,
} from "@/components/layout/sidebar";

// `@/app/actions/dashboard` and `@/app/actions/subscriptions` are aliased in
// .storybook/main.ts to mocks/actions.ts. getDashboardStats stubs non-zero
// counts and getPinnedSubscriptions stubs 3 seeded pins.

const sheetDecorator: Decorator = (Story) => (
  <Sheet defaultOpen>
    <SheetContent
      side="left"
      className="flex w-[280px] flex-col p-0 sm:w-[320px]"
    >
      <Story />
    </SheetContent>
  </Sheet>
);

const withProviders: Decorator = (Story) => (
  <SidebarCountsProvider>
    <PinnedSubscriptionsProvider>
      <div className="flex h-screen bg-background">
        <Story />
        <div className="flex-1 p-6">
          <p className="text-sm text-muted-foreground">App content area</p>
        </div>
      </div>
    </PinnedSubscriptionsProvider>
  </SidebarCountsProvider>
);

const meta: Meta<typeof Sidebar> = {
  title: "Layout/Sidebar",
  component: Sidebar,
  args: { isAdmin: false },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [withProviders],
  loaders: [
    async () => {
      localStorage.removeItem(PINNED_EXPANDED_STORAGE_NAME);
      return {};
    },
  ],
};

export default meta;
type Story = StoryObj<typeof Sidebar>;

export const Default: Story = {};

export const WithBadges: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Same render as Default — documented separately to visualize non-zero subscription/library badge counts from the mocked getDashboardStats.",
      },
    },
  },
};

export const WithAdmin: Story = {
  args: { isAdmin: true },
  parameters: {
    docs: {
      description: {
        story: "Inline aside with the admin link visible.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    // Scope to the iframe's body so the same query works for inline renders
    // and for the InSheet variant where Radix portals the content out of
    // canvasElement.
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("link", { name: /admin/i }),
    ).toBeVisible();
  },
};

export const InSheet: Story = {
  decorators: [sheetDecorator],
  args: { inSheet: true },
};

export const InSheetWithAdmin: Story = {
  ...InSheet,
  args: { ...InSheet.args, isAdmin: true },
  parameters: {
    docs: {
      description: {
        story:
          "Sidebar rendered inside a Sheet (mobile nav mode) with the admin link visible.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByRole("link", { name: /admin/i }),
    ).toBeVisible();
  },
};

export const WithPinnedPodcasts: Story = {
  parameters: {
    docs: {
      description: {
        story: "Sidebar with a populated pinned-podcasts section expanded.",
      },
    },
  },
  loaders: [
    async () => {
      localStorage.setItem(
        PINNED_EXPANDED_STORAGE_NAME,
        PINNED_EXPANDED_STORAGE_VALUE,
      );
      return {};
    },
  ],
};

export const WithPinnedPodcastsInSheet: Story = {
  decorators: [sheetDecorator],
  args: { inSheet: true },
  parameters: {
    docs: {
      description: {
        story:
          "Sidebar in mobile sheet mode with a populated pinned-podcasts section expanded.",
      },
    },
  },
  loaders: [
    async () => {
      localStorage.setItem(
        PINNED_EXPANDED_STORAGE_NAME,
        PINNED_EXPANDED_STORAGE_VALUE,
      );
      return {};
    },
  ],
};
