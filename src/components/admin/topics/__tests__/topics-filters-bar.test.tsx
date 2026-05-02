import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";

// Override the global next/navigation mock with test-local fns
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/admin/topics",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

vi.mock("@/db/schema", () => ({
  canonicalTopicStatusEnum: { enumValues: ["active", "merged", "dormant"] },
  canonicalTopicKindEnum: {
    enumValues: [
      "release",
      "incident",
      "regulation",
      "announcement",
      "deal",
      "event",
      "concept",
      "work",
      "other",
    ],
  },
}));

// ---------------------------------------------------------------------------
// Mock shadcn Select primitives with a context-based implementation so
// option clicks propagate up to the Select's onValueChange without relying
// on Radix's pointer-event handling (which jsdom doesn't fully support).
// ---------------------------------------------------------------------------
const SelectValueChangeCtx = React.createContext<
  ((v: string) => void) | undefined
>(undefined);

vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
  }) =>
    React.createElement(
      SelectValueChangeCtx.Provider,
      { value: onValueChange },
      children,
    ),
  SelectTrigger: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement("button", { role: "combobox", ...props }, children),
  SelectValue: ({ placeholder }: { placeholder?: string }) =>
    React.createElement("span", null, placeholder ?? ""),
  SelectContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => {
    const onChange = React.useContext(SelectValueChangeCtx);
    return React.createElement(
      "button",
      { role: "option", onClick: () => onChange?.(value) },
      children,
    );
  },
}));

// ---------------------------------------------------------------------------

import { TopicsFiltersBar } from "@/components/admin/topics/topics-filters-bar";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ===========================================================================
// Ongoing filter
// ===========================================================================

describe("TopicsFiltersBar — Ongoing filter", () => {
  it("renders the Ongoing select trigger", () => {
    render(<TopicsFiltersBar />);
    expect(
      screen.getByRole("combobox", { name: /ongoing/i }),
    ).toBeInTheDocument();
  });

  it("selecting 'Yes' pushes ongoing=yes to the URL", () => {
    render(<TopicsFiltersBar />);

    const yesOption = screen.getByRole("option", { name: /^yes$/i });
    act(() => {
      fireEvent.click(yesOption);
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("ongoing=yes"),
    );
  });

  it("selecting 'No' pushes ongoing=no to the URL", () => {
    render(<TopicsFiltersBar />);

    const noOption = screen.getByRole("option", { name: /^no$/i });
    act(() => {
      fireEvent.click(noOption);
    });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("ongoing=no"),
    );
  });

  it("selecting 'Any' removes the ongoing param from the URL", () => {
    render(<TopicsFiltersBar />);

    const anyOption = screen.getByRole("option", { name: /^any$/i });
    act(() => {
      fireEvent.click(anyOption);
    });

    const lastUrl = mockPush.mock.calls.at(-1)?.[0] ?? "";
    expect(lastUrl).not.toContain("ongoing=");
  });
});

// ===========================================================================
// Episode-count range filters
// ===========================================================================

describe("TopicsFiltersBar — episode-count range inputs", () => {
  it("renders Min episodes and Max episodes inputs", () => {
    render(<TopicsFiltersBar />);
    expect(
      screen.getByRole("spinbutton", { name: /min episodes/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: /max episodes/i }),
    ).toBeInTheDocument();
  });

  it("typing in Min input pushes episodeCountMin param after debounce", () => {
    render(<TopicsFiltersBar />);

    const minInput = screen.getByRole("spinbutton", { name: /min episodes/i });
    act(() => {
      fireEvent.change(minInput, { target: { value: "5" } });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const lastUrl = mockPush.mock.calls.at(-1)?.[0] ?? "";
    expect(lastUrl).toContain("episodeCountMin=5");
  });

  it("typing in Max input pushes episodeCountMax param after debounce", () => {
    render(<TopicsFiltersBar />);

    const maxInput = screen.getByRole("spinbutton", { name: /max episodes/i });
    act(() => {
      fireEvent.change(maxInput, { target: { value: "20" } });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const lastUrl = mockPush.mock.calls.at(-1)?.[0] ?? "";
    expect(lastUrl).toContain("episodeCountMax=20");
  });

  it("clearing Min input removes episodeCountMin from the URL", () => {
    render(<TopicsFiltersBar />);

    const minInput = screen.getByRole("spinbutton", { name: /min episodes/i });

    // First type something and let debounce fire
    act(() => {
      fireEvent.change(minInput, { target: { value: "5" } });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    vi.clearAllMocks();

    // Then clear and debounce again
    act(() => {
      fireEvent.change(minInput, { target: { value: "" } });
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    const lastUrl = mockPush.mock.calls.at(-1)?.[0] ?? "";
    expect(lastUrl).not.toContain("episodeCountMin=");
  });
});
