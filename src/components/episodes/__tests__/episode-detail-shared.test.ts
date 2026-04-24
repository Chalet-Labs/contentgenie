import { describe, expect, it } from "vitest";
import {
  buildSignUpHref,
  supportsEpisodeProcessing,
} from "@/components/episodes/episode-detail-shared";

describe("episode-detail-shared", () => {
  it("builds sign-up redirects for internal paths", () => {
    expect(buildSignUpHref("/episode/123")).toBe(
      "/sign-up?redirect_url=%2Fepisode%2F123",
    );
  });

  it("falls back to the bare sign-up page for unsafe redirect targets", () => {
    expect(buildSignUpHref("https://evil.example")).toBe("/sign-up");
    expect(buildSignUpHref("//evil.example")).toBe("/sign-up");
    expect(buildSignUpHref("javascript:alert(1)")).toBe("/sign-up");
  });

  it("only allows numeric episode ids for processing actions", () => {
    expect(supportsEpisodeProcessing("123")).toBe(true);
    expect(supportsEpisodeProcessing("rss-abc")).toBe(false);
  });
});
