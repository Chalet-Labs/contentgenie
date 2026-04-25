import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { SleepTimerMenu } from "@/components/audio-player/sleep-timer-menu";
import { STORY_NOW, audioPlayerContextDecorator } from "@/test/story-fixtures";

const layout: Decorator = (Story) => (
  <div className="flex items-end justify-end p-4" style={{ minHeight: 400 }}>
    <Story />
  </div>
);

const meta: Meta<typeof SleepTimerMenu> = {
  title: "AudioPlayer/SleepTimerMenu",
  component: SleepTimerMenu,
  decorators: [layout],
};

export default meta;
type Story = StoryObj<typeof SleepTimerMenu>;

export const Default: Story = {
  decorators: [audioPlayerContextDecorator()],
};

export const ActiveDurationTimer: Story = {
  name: "Active Duration Timer (25:30 remaining)",
  decorators: [
    audioPlayerContextDecorator({
      state: {
        sleepTimer: {
          endTime: new Date(
            STORY_NOW.getTime() + 25 * 60_000 + 30_000,
          ).getTime(),
          type: "duration",
        },
      },
    }),
  ],
};

export const ActiveEndOfEpisode: Story = {
  name: "Active End-of-Episode Timer",
  decorators: [
    audioPlayerContextDecorator({
      state: {
        sleepTimer: {
          endTime: null,
          type: "end-of-episode",
        },
      },
    }),
  ],
};
