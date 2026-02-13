import type { Meta, StoryObj } from "@storybook/react"
import type { ReactNode } from "react"
import {
  AudioPlayerAPIContext,
  AudioPlayerStateContext,
  AudioPlayerProgressContext,
  type AudioPlayerState,
  type AudioPlayerAPI,
} from "@/contexts/audio-player-context"
import { PlaybackSpeed } from "./playback-speed"

const noopAPI: AudioPlayerAPI = {
  playEpisode: () => {},
  togglePlay: () => {},
  seek: () => {},
  skipForward: () => {},
  skipBack: () => {},
  setVolume: () => {},
  setPlaybackSpeed: () => {},
  closePlayer: () => {},
}

const baseState: AudioPlayerState = {
  currentEpisode: null,
  isPlaying: false,
  isBuffering: false,
  isVisible: false,
  duration: 0,
  volume: 1,
  playbackSpeed: 1,
  hasError: false,
  errorMessage: null,
}

function MockProvider({
  state,
  children,
}: {
  state: AudioPlayerState
  children: ReactNode
}) {
  return (
    <AudioPlayerAPIContext.Provider value={noopAPI}>
      <AudioPlayerStateContext.Provider value={state}>
        <AudioPlayerProgressContext.Provider
          value={{ currentTime: 0, buffered: 0 }}
        >
          {children}
        </AudioPlayerProgressContext.Provider>
      </AudioPlayerStateContext.Provider>
    </AudioPlayerAPIContext.Provider>
  )
}

const meta: Meta<typeof PlaybackSpeed> = {
  title: "AudioPlayer/PlaybackSpeed",
  component: PlaybackSpeed,
}

export default meta
type Story = StoryObj<typeof PlaybackSpeed>

export const Speed1x: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, playbackSpeed: 1 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const Speed125x: Story = {
  name: "Speed 1.25x",
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, playbackSpeed: 1.25 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const Speed15x: Story = {
  name: "Speed 1.5x",
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, playbackSpeed: 1.5 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}

export const Speed2x: Story = {
  decorators: [
    (Story) => (
      <MockProvider state={{ ...baseState, playbackSpeed: 2 }}>
        <div className="p-4">
          <Story />
        </div>
      </MockProvider>
    ),
  ],
}
