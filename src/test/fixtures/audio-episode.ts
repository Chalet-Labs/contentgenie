import type { AudioEpisode } from "@/contexts/audio-player-context";

export const validEpisode: AudioEpisode = {
  id: "ep-1",
  title: "Test Episode",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio.mp3",
  artwork: "https://example.com/art.jpg",
  duration: 600,
};

export const validEpisode2: AudioEpisode = {
  id: "ep-2",
  title: "Test Episode 2",
  podcastTitle: "Test Podcast",
  audioUrl: "https://example.com/audio2.mp3",
};
