import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Logo } from "./logo";

const meta = {
  title: "Brand/Logo",
  component: Logo,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "inline-radio",
      options: ["mark", "mark-mono", "lockup"],
    },
    size: { control: "number" },
  },
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mark: Story = {
  args: { variant: "mark", size: 32 },
};

export const MarkSmall: Story = {
  args: { variant: "mark", size: 16 },
};

export const MarkLarge: Story = {
  args: { variant: "mark", size: 96 },
};

export const MarkMono: Story = {
  args: { variant: "mark-mono", size: 32, className: "text-foreground" },
};

export const Lockup: Story = {
  args: { variant: "lockup", size: 32 },
};

export const LockupLarge: Story = {
  args: { variant: "lockup", size: 56 },
};
