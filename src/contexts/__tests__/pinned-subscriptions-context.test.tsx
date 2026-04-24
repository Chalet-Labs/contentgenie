import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import {
  PinnedSubscriptionsProvider,
  usePinnedSubscriptions,
  usePinnedSubscriptionsOptional,
} from "@/contexts/pinned-subscriptions-context";
import { PINS_CHANGED_EVENT } from "@/lib/events";

const mockGetPinnedSubscriptions = vi.fn();
vi.mock("@/app/actions/subscriptions", () => ({
  getPinnedSubscriptions: (...args: unknown[]) =>
    mockGetPinnedSubscriptions(...args),
}));

const SEED_PINS = [
  {
    id: 1,
    podcastId: 10,
    podcastIndexId: "10",
    title: "Alpha",
    imageUrl: null,
  },
  { id: 2, podcastId: 20, podcastIndexId: "20", title: "Beta", imageUrl: null },
];

function TestConsumer() {
  const { pinned, isLoading, refreshPins } = usePinnedSubscriptions();
  return (
    <div>
      <span data-testid="count">{pinned.length}</span>
      <span data-testid="loading">{isLoading ? "loading" : "done"}</span>
      <button data-testid="refresh" onClick={refreshPins}>
        refresh
      </button>
    </div>
  );
}

describe("PinnedSubscriptionsProvider", () => {
  beforeEach(() => {
    mockGetPinnedSubscriptions.mockResolvedValue({
      success: true,
      data: SEED_PINS,
    });
  });

  it("fetches on mount and exposes pinned array and isLoading=false", async () => {
    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(mockGetPinnedSubscriptions).toHaveBeenCalledTimes(1);
  });

  it("shows isLoading=true during fetch and false after resolve", async () => {
    let resolve: (v: unknown) => void;
    mockGetPinnedSubscriptions.mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }),
    );

    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    expect(screen.getByTestId("loading").textContent).toBe("loading");

    await act(async () => {
      resolve!({ success: true, data: SEED_PINS });
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });
  });

  it("refreshPins triggers a second fetch with updated data", async () => {
    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    const callsAfterMount = mockGetPinnedSubscriptions.mock.calls.length;

    const newPin = {
      id: 3,
      podcastId: 30,
      podcastIndexId: "30",
      title: "Gamma",
      imageUrl: null,
    };
    mockGetPinnedSubscriptions.mockResolvedValue({
      success: true,
      data: [...SEED_PINS, newPin],
    });

    await act(async () => {
      screen.getByTestId("refresh").click();
    });

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("3");
    });

    expect(mockGetPinnedSubscriptions.mock.calls.length).toBe(
      callsAfterMount + 1,
    );
  });

  it("ignores stale response when a second refresh fires before the first resolves", async () => {
    let resolveFirst: (v: unknown) => void;
    let resolveSecond: (v: unknown) => void;

    mockGetPinnedSubscriptions
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveFirst = res;
        }),
      )
      .mockReturnValueOnce(
        new Promise((res) => {
          resolveSecond = res;
        }),
      );

    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    // Trigger second refresh while first is still pending
    act(() => {
      screen.getByTestId("refresh").click();
    });

    // Resolve second first, then first — only second result should apply
    const secondData = [
      {
        id: 10,
        podcastId: 100,
        podcastIndexId: "100",
        title: "Second",
        imageUrl: null,
      },
    ];
    const firstData = [
      {
        id: 11,
        podcastId: 110,
        podcastIndexId: "110",
        title: "Stale",
        imageUrl: null,
      },
      {
        id: 12,
        podcastId: 120,
        podcastIndexId: "120",
        title: "Stale2",
        imageUrl: null,
      },
    ];

    await act(async () => {
      resolveSecond!({ success: true, data: secondData });
    });

    await act(async () => {
      resolveFirst!({ success: true, data: firstData });
    });

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    // Should show secondData (1 item), not firstData (2 items)
    expect(screen.getByTestId("count").textContent).toBe("1");
  });

  it("dispatching pins-changed event triggers a refetch", async () => {
    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    const callsAfterMount = mockGetPinnedSubscriptions.mock.calls.length;

    const updatedPin = {
      id: 5,
      podcastId: 50,
      podcastIndexId: "50",
      title: "Epsilon",
      imageUrl: null,
    };
    mockGetPinnedSubscriptions.mockResolvedValue({
      success: true,
      data: [updatedPin],
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent(PINS_CHANGED_EVENT));
    });

    await waitFor(() => {
      expect(screen.getByTestId("count").textContent).toBe("1");
    });

    expect(mockGetPinnedSubscriptions.mock.calls.length).toBe(
      callsAfterMount + 1,
    );
  });

  it("logs warn and keeps pinned=[] when success is false", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGetPinnedSubscriptions.mockResolvedValue({
      success: false,
      error: "Not signed in",
    });

    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    expect(consoleWarn).toHaveBeenCalledWith(
      "[PinnedSubscriptions] Server returned error:",
      "Not signed in",
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
    consoleWarn.mockRestore();
  });

  it("removes pins-changed listener on unmount", async () => {
    const { unmount } = render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    const callsBeforeUnmount = mockGetPinnedSubscriptions.mock.calls.length;
    unmount();

    await act(async () => {
      window.dispatchEvent(new CustomEvent(PINS_CHANGED_EVENT));
    });

    expect(mockGetPinnedSubscriptions.mock.calls.length).toBe(
      callsBeforeUnmount,
    );
  });

  it("logs error and sets isLoading=false when getPinnedSubscriptions throws", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mockGetPinnedSubscriptions.mockRejectedValue(new Error("Network failure"));

    render(
      <PinnedSubscriptionsProvider>
        <TestConsumer />
      </PinnedSubscriptionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("done");
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[PinnedSubscriptions] Failed to fetch pinned subscriptions:",
      expect.any(Error),
    );
    expect(screen.getByTestId("count").textContent).toBe("0");
    consoleError.mockRestore();
  });
});

describe("usePinnedSubscriptions", () => {
  it("throws when used outside provider", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow(
      "usePinnedSubscriptions must be used within PinnedSubscriptionsProvider",
    );

    consoleError.mockRestore();
  });
});

describe("usePinnedSubscriptionsOptional", () => {
  it("returns exact fallback shape when used outside provider", () => {
    function OptionalConsumer() {
      const { pinned, isLoading, refreshPins } =
        usePinnedSubscriptionsOptional();
      return (
        <div>
          <span data-testid="count">{pinned.length}</span>
          <span data-testid="loading">{isLoading ? "loading" : "done"}</span>
          <button data-testid="refresh" onClick={refreshPins}>
            refresh
          </button>
        </div>
      );
    }

    render(<OptionalConsumer />);

    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("loading").textContent).toBe("done");
    // Should not throw (no-op)
    expect(() => screen.getByTestId("refresh").click()).not.toThrow();
  });
});
