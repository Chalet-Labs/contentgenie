import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

const meta: Meta = {
  title: "PWA/InstallBanner",
  parameters: {
    layout: "fullscreen",
    viewport: { defaultViewport: "mobile1" },
  },
};

export default meta;
type Story = StoryObj;

// Since InstallBanner relies on the usePwaInstall hook which requires browser
// PWA APIs, we render a static visual replica for Storybook.
export const Visible: Story = {
  render: () => (
    <div className="relative min-h-[200px] bg-background">
      <div className="fixed bottom-0 left-0 right-0 z-40 p-4 animate-in slide-in-from-bottom duration-300">
        {/* zinc-900/800 mocks an OS-level dark install prompt — intentional, not product chrome */}
        <div className="flex items-center gap-3 rounded-lg bg-zinc-900 p-4 shadow-lg dark:bg-zinc-800">
          <Logo variant="mark" size={40} label="" className="shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">
              Install ContentGenie
            </p>
            <p className="text-xs text-zinc-400">
              Get the full app experience
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm">Install</Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-zinc-700"
              aria-label="Dismiss install banner"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  ),
};
