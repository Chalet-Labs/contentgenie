import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import type { ReactNode } from "react"
import { SidebarCountsProvider } from "@/contexts/sidebar-counts-context"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Sidebar } from "@/components/layout/sidebar"

// ---------------------------------------------------------------------------
// Provider decorator — wraps stories that need SidebarCountsProvider.
// @/app/actions/dashboard is aliased in .storybook/main.ts to mocks/actions.ts,
// which stubs getDashboardStats to return { subscriptionCount: 3, savedCount: 5 },
// so badges render without network calls.
// ---------------------------------------------------------------------------

function CountsProvider({ children }: { children: ReactNode }) {
  return <SidebarCountsProvider>{children}</SidebarCountsProvider>
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof Sidebar> = {
  title: "Layout/Sidebar",
  component: Sidebar,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <CountsProvider>
        <div className="flex h-screen bg-background">
          <Story />
          <div className="flex-1 p-6">
            <p className="text-muted-foreground text-sm">App content area</p>
          </div>
        </div>
      </CountsProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Sidebar>

// ---------------------------------------------------------------------------
// Inline aside stories (inSheet = false — default)
// ---------------------------------------------------------------------------

export const Default: Story = {
  args: { isAdmin: false },
}

export const WithBadges: Story = {
  // SidebarCountsProvider fetches from the mocked getDashboardStats which returns
  // subscriptionCount: 3, savedCount: 5 — badges appear automatically.
  args: { isAdmin: false },
}

export const WithAdmin: Story = {
  args: { isAdmin: true },
  parameters: {
    docs: {
      description: {
        story: "Inline aside with the admin link visible.",
      },
    },
  },
}

// ---------------------------------------------------------------------------
// In-sheet stories (inSheet = true)
// ---------------------------------------------------------------------------

export const InSheet: Story = {
  decorators: [
    (Story) => (
      <Sheet defaultOpen>
        <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
          <Story />
        </SheetContent>
      </Sheet>
    ),
  ],
  args: { inSheet: true, isAdmin: false },
}

export const InSheetWithAdmin: Story = {
  decorators: [
    (Story) => (
      <Sheet defaultOpen>
        <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
          <Story />
        </SheetContent>
      </Sheet>
    ),
  ],
  args: { inSheet: true, isAdmin: true },
  parameters: {
    docs: {
      description: {
        story: "Sidebar rendered inside a Sheet (mobile nav mode) with the admin link visible.",
      },
    },
  },
}
