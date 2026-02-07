import type { Meta, StoryObj } from "@storybook/react";
import { RatingInput } from "./rating-input";

const meta: Meta<typeof RatingInput> = {
  title: "Episodes/RatingInput",
  component: RatingInput,
};

export default meta;
type Story = StoryObj<typeof RatingInput>;

export const Default: Story = {
  args: {
    initialRating: null,
    onRatingChange: async () => ({ success: true }),
  },
};

export const WithRating: Story = {
  args: {
    initialRating: 4,
    onRatingChange: async () => ({ success: true }),
  },
};

export const Disabled: Story = {
  args: {
    initialRating: 3,
    onRatingChange: async () => ({ success: true }),
    disabled: true,
  },
};

export const Small: Story = {
  args: {
    initialRating: null,
    onRatingChange: async () => ({ success: true }),
    size: "sm",
  },
};

export const Large: Story = {
  args: {
    initialRating: 5,
    onRatingChange: async () => ({ success: true }),
    size: "lg",
  },
};
