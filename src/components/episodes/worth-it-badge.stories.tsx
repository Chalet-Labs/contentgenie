import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { WorthItBadge } from "./worth-it-badge";

const meta: Meta<typeof WorthItBadge> = {
  title: "Episodes/WorthItBadge",
  component: WorthItBadge,
  decorators: [
    (Story) => (
      <div className="flex items-center gap-4 p-6">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof WorthItBadge>;

export const HighScore: Story = {
  args: {
    score: 8.5,
  },
};

export const MidScore: Story = {
  args: {
    score: 6.0,
  },
};

export const Decent: Story = {
  args: {
    score: 4.5,
  },
};

export const LowScore: Story = {
  args: {
    score: 2.5,
  },
};

export const VeryLow: Story = {
  args: {
    score: 1.0,
  },
};

export const NoScore: Story = {
  args: {
    score: null,
  },
};
