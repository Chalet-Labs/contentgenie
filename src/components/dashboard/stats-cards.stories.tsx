import type { Meta, StoryObj } from "@storybook/react";
import { StatsCards } from "./stats-cards";

const meta: Meta<typeof StatsCards> = {
  title: "Dashboard/StatsCards",
  component: StatsCards,
};

export default meta;
type Story = StoryObj<typeof StatsCards>;

export const Default: Story = {
  args: {
    subscriptionCount: 12,
    savedCount: 45,
  },
};

export const Empty: Story = {
  args: {
    subscriptionCount: 0,
    savedCount: 0,
  },
};

export const Loading: Story = {
  args: {
    subscriptionCount: 0,
    savedCount: 0,
    isLoading: true,
  },
};

export const HighNumbers: Story = {
  args: {
    subscriptionCount: 150,
    savedCount: 1200,
  },
};
