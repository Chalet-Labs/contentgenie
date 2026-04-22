import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite"
import { SidebarCountsProvider } from "@/contexts/sidebar-counts-context"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Sidebar } from "@/components/layout/sidebar"

// `@/app/actions/dashboard` is aliased in .storybook/main.ts to mocks/actions.ts,
// which stubs getDashboardStats with non-zero counts so badges render without
// network calls. See .storybook/mocks/actions.ts for the concrete values.

const sheetDecorator: Decorator = (Story) => (
  <Sheet defaultOpen>
    <SheetContent side="left" className="w-[280px] sm:w-[320px] p-0 flex flex-col">
      <Story />
    </SheetContent>
  </Sheet>
)

const meta: Meta<typeof Sidebar> = {
  title: "Layout/Sidebar",
  component: Sidebar,
  args: { isAdmin: false },
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <SidebarCountsProvider>
        <div className="flex h-screen bg-background">
          <Story />
          <div className="flex-1 p-6">
            <p className="text-muted-foreground text-sm">App content area</p>
          </div>
        </div>
      </SidebarCountsProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof Sidebar>

export const Default: Story = {}

export const WithBadges: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Same render as Default — documented separately to visualize non-zero subscription/library badge counts from the mocked getDashboardStats.",
      },
    },
  },
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

export const InSheet: Story = {
  decorators: [sheetDecorator],
  args: { inSheet: true },
}

export const InSheetWithAdmin: Story = {
  ...InSheet,
  args: { ...InSheet.args, isAdmin: true },
  parameters: {
    docs: {
      description: {
        story: "Sidebar rendered inside a Sheet (mobile nav mode) with the admin link visible.",
      },
    },
  },
}
