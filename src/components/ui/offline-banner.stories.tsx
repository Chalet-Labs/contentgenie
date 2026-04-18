import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { OfflineBanner } from "./offline-banner";

const meta: Meta<typeof OfflineBanner> = {
  title: "UI/OfflineBanner",
  component: OfflineBanner,
};

export default meta;
type Story = StoryObj<typeof OfflineBanner>;

export const Offline: Story = {
  args: { isOffline: true },
};

export const Online: Story = {
  args: { isOffline: false },
};
