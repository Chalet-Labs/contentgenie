import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { SeekBar } from "./seek-bar";
import { audioPlayerContextDecorator } from "@/test/story-fixtures";

const seekBarLayout: Decorator = (Story) => (
  <div className="mx-auto max-w-lg p-4">
    <Story />
  </div>
);

const meta: Meta<typeof SeekBar> = {
  title: "AudioPlayer/SeekBar",
  component: SeekBar,
  decorators: [seekBarLayout],
};

export default meta;
type Story = StoryObj<typeof SeekBar>;

export const Default: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { duration: 300 },
      progress: { currentTime: 45, buffered: 120 },
    }),
  ],
};

export const NearEnd: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { duration: 300 },
      progress: { currentTime: 285, buffered: 300 },
    }),
  ],
};

export const LongEpisode: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { duration: 7200 },
      progress: { currentTime: 3600, buffered: 4500 },
    }),
  ],
};

export const BufferedRange: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { duration: 600 },
      progress: { currentTime: 30, buffered: 450 },
    }),
  ],
};

export const ZeroDuration: Story = {
  decorators: [audioPlayerContextDecorator()],
};

export const WithChapterMarkers: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: {
        duration: 3600,
        chapters: [
          { startTime: 0, title: "Introduction" },
          { startTime: 300, title: "Guest Interview" },
          { startTime: 900, title: "Deep Dive" },
          { startTime: 1800, title: "Q&A" },
          { startTime: 3000, title: "Outro" },
        ],
      },
      progress: { currentTime: 600, buffered: 1200 },
    }),
  ],
};

export const NoChapterMarkers: Story = {
  decorators: [
    audioPlayerContextDecorator({
      state: { duration: 3600 },
      progress: { currentTime: 600, buffered: 1200 },
    }),
  ],
};
