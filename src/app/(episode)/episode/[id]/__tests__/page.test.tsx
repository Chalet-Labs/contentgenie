import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const mockAuth = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}));

vi.mock("@/components/episodes/authenticated-episode-detail", () => ({
  AuthenticatedEpisodeDetail: ({
    episodeId,
    isAdmin,
    userId,
  }: {
    episodeId: string;
    isAdmin: boolean;
    userId: string;
  }) => (
    <div data-testid="authenticated-episode-detail">
      auth:{episodeId}:{userId}:{String(isAdmin)}
    </div>
  ),
}));

vi.mock("@/components/episodes/public-episode-detail", () => ({
  PublicEpisodeDetail: ({ episodeId }: { episodeId: string }) => (
    <div data-testid="public-episode-detail">public:{episodeId}</div>
  ),
}));

import EpisodePage from "@/app/(episode)/episode/[id]/page";

describe("EpisodePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the public detail component for anonymous viewers", async () => {
    mockAuth.mockResolvedValue({ userId: null, has: () => false });

    render(
      (await EpisodePage({
        params: { id: "123" },
      })) as React.ReactElement
    );

    expect(screen.getByTestId("public-episode-detail")).toHaveTextContent(
      "public:123"
    );
    expect(
      screen.queryByTestId("authenticated-episode-detail")
    ).not.toBeInTheDocument();
  });

  it("renders the authenticated detail component for signed-in viewers", async () => {
    mockAuth.mockResolvedValue({
      userId: "user-1",
      has: ({ role }: { role: string }) => role === "org:admin",
    });

    render(
      (await EpisodePage({
        params: { id: "123" },
      })) as React.ReactElement
    );

    expect(
      screen.getByTestId("authenticated-episode-detail")
    ).toHaveTextContent("auth:123:user-1:true");
    expect(screen.queryByTestId("public-episode-detail")).not.toBeInTheDocument();
  });
});
