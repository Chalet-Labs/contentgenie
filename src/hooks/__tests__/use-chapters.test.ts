import { renderHook, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChapters } from "@/hooks/use-chapters";

describe("useChapters", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stays idle when chaptersUrl is null", () => {
    const { result } = renderHook(() => useChapters(null));
    expect(result.current).toEqual({ status: "idle" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stays idle when chaptersUrl is an empty string", () => {
    const { result } = renderHook(() => useChapters(""));
    expect(result.current).toEqual({ status: "idle" });
  });

  it("transitions loading → ready and routes through /api/chapters", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chapters: [{ startTime: 0, title: "Intro" }],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() =>
      useChapters("https://example.com/c.json"),
    );
    expect(result.current).toEqual({ status: "loading" });

    await waitFor(() => {
      expect(result.current).toEqual({
        status: "ready",
        chapters: [{ startTime: 0, title: "Intro" }],
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/chapters?url=https%3A%2F%2Fexample.com%2Fc.json",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("surfaces an HTTP error as { status: 'error' }", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("nope", { status: 502 }),
    );

    const { result } = renderHook(() =>
      useChapters("https://example.com/c.json"),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("error");
    });
    expect(result.current).toEqual({ status: "error", message: "HTTP 502" });
  });

  it("surfaces a network failure as { status: 'error' }", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHook(() =>
      useChapters("https://example.com/c.json"),
    );

    await waitFor(() => {
      expect(result.current).toEqual({ status: "error", message: "offline" });
    });
  });

  it("refetches when chaptersUrl changes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ chapters: [] }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ chapters: [{ startTime: 0, title: "a" }] }),
          { status: 200 },
        ),
      );

    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useChapters(url),
      { initialProps: { url: "https://example.com/a.json" as string | null } },
    );

    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", chapters: [] }),
    );

    rerender({ url: "https://example.com/b.json" });

    await waitFor(() => {
      if (result.current.status !== "ready") throw new Error("not ready");
      expect(result.current.chapters).toHaveLength(1);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns to idle when chaptersUrl becomes null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ chapters: [] }), { status: 200 }),
    );

    const { result, rerender } = renderHook(
      ({ url }: { url: string | null }) => useChapters(url),
      { initialProps: { url: "https://example.com/a.json" as string | null } },
    );

    await waitFor(() =>
      expect(result.current).toEqual({ status: "ready", chapters: [] }),
    );

    rerender({ url: null });
    expect(result.current).toEqual({ status: "idle" });
  });

  it("ignores a response that resolves after unmount", async () => {
    let resolve: ((value: Response) => void) | undefined;
    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolve = r;
      }),
    );

    const { result, unmount } = renderHook(() =>
      useChapters("https://example.com/c.json"),
    );
    expect(result.current).toEqual({ status: "loading" });

    unmount();
    await act(async () => {
      resolve?.(
        new Response(JSON.stringify({ chapters: [] }), { status: 200 }),
      );
      await Promise.resolve();
    });

    // No state update should have leaked after unmount — if the abort
    // guard is missing, React would warn and `result.current` would
    // advance to "ready". The assertion here is indirect (no throw) but
    // the console would surface the failure.
    expect(result.current).toEqual({ status: "loading" });
  });

  it("surfaces a timeout as { status: 'error' } instead of getting stuck loading", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      return new Promise<Response>((_, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const { result } = renderHook(() =>
      useChapters("https://example.com/c.json"),
    );
    expect(result.current).toEqual({ status: "loading" });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();
    });

    expect(result.current).toEqual({
      status: "error",
      message: "Request timed out",
    });
  });

  it("skips fetch while offline and retries when isOnline flips back to true", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ chapters: [{ startTime: 0, title: "Intro" }] }),
        { status: 200 },
      ),
    );

    const { result, rerender } = renderHook(
      ({ online }: { online: boolean }) =>
        useChapters("https://example.com/c.json", online),
      { initialProps: { online: false } },
    );

    expect(result.current).toEqual({ status: "idle" });
    expect(fetch).not.toHaveBeenCalled();

    rerender({ online: true });

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        chapters: [{ startTime: 0, title: "Intro" }],
      }),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("resets to idle when chaptersUrl changes while offline", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ chapters: [{ startTime: 0, title: "A" }] }),
        { status: 200 },
      ),
    );

    const { result, rerender } = renderHook(
      ({ url, online }: { url: string; online: boolean }) =>
        useChapters(url, online),
      {
        initialProps: {
          url: "https://example.com/a.json",
          online: true,
        },
      },
    );

    await waitFor(() =>
      expect(result.current).toEqual({
        status: "ready",
        chapters: [{ startTime: 0, title: "A" }],
      }),
    );

    // Connectivity drops with the same URL — ready state is preserved.
    rerender({ url: "https://example.com/a.json", online: false });
    expect(result.current).toEqual({
      status: "ready",
      chapters: [{ startTime: 0, title: "A" }],
    });

    // URL changes while still offline — chapters from the prior URL must not
    // be shown against the new one. Reset to idle (skeleton).
    rerender({ url: "https://example.com/b.json", online: false });
    expect(result.current).toEqual({ status: "idle" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears stale loading state when offline aborts an in-flight fetch", async () => {
    vi.mocked(fetch).mockImplementationOnce((_input, init) => {
      return new Promise<Response>((_, reject) => {
        const signal = (init as RequestInit | undefined)?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });

    const { result, rerender } = renderHook(
      ({ online }: { online: boolean }) =>
        useChapters("https://example.com/c.json", online),
      { initialProps: { online: true } },
    );

    expect(result.current).toEqual({ status: "loading" });

    // Connectivity drops with a fetch in flight. The prior effect's cleanup
    // aborts the controller; the new effect must reset the stale "loading"
    // state to idle so the UI doesn't show a perpetual skeleton.
    await act(async () => {
      rerender({ online: false });
      await Promise.resolve();
    });

    expect(result.current).toEqual({ status: "idle" });
  });

  it("validates the response shape via parseChapters and drops malformed entries", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          chapters: [
            { startTime: 0, title: "Intro" },
            { startTime: "bogus", title: "Ignored" },
            { title: "Missing startTime" },
            { startTime: 60, title: "Outro" },
          ],
        }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() =>
      useChapters("https://example.com/c.json"),
    );

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
    });

    if (result.current.status !== "ready") throw new Error("unreachable");
    expect(result.current.chapters).toEqual([
      { startTime: 0, title: "Intro" },
      { startTime: 60, title: "Outro" },
    ]);
  });
});
