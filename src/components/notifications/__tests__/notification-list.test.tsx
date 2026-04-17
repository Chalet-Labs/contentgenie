import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationList } from "@/components/notifications/notification-list";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockMarkNotificationRead = vi.fn();
vi.mock("@/app/actions/notifications", () => ({
  markNotificationRead: (...args: unknown[]) => mockMarkNotificationRead(...args),
}));

function makeNotification(overrides: Partial<Parameters<typeof NotificationList>[0]["notifications"][0]> = {}) {
  return {
    id: 1,
    type: "new_episode",
    title: "Test Podcast",
    body: "New episode: Test",
    isRead: false,
    createdAt: new Date(),
    episodePodcastIndexId: "PI-42",
    episodeTitle: "Test Episode",
    podcastTitle: "Test Podcast",
    ...overrides,
  };
}

describe("NotificationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMarkNotificationRead.mockResolvedValue({ success: true });
  });

  it("navigates to episode page using PodcastIndex ID on click", async () => {
    const user = userEvent.setup();
    render(
      <NotificationList
        notifications={[makeNotification({ episodePodcastIndexId: "PI-42" })]}
      />
    );

    await user.click(screen.getByRole("button"));

    expect(mockPush).toHaveBeenCalledWith("/episode/PI-42");
  });

  it("navigates to dashboard when episodePodcastIndexId is null", async () => {
    const user = userEvent.setup();
    render(
      <NotificationList
        notifications={[makeNotification({ episodePodcastIndexId: null })]}
      />
    );

    await user.click(screen.getByRole("button"));

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("marks unread notification as read on click", async () => {
    const user = userEvent.setup();
    render(
      <NotificationList
        notifications={[makeNotification({ id: 7, isRead: false })]}
      />
    );

    await user.click(screen.getByRole("button"));

    expect(mockMarkNotificationRead).toHaveBeenCalledWith(7);
  });

  it("does not mark already-read notification as read", async () => {
    const user = userEvent.setup();
    render(
      <NotificationList
        notifications={[makeNotification({ isRead: true })]}
      />
    );

    await user.click(screen.getByRole("button"));

    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
  });

  it("shows empty state when no notifications", () => {
    render(<NotificationList notifications={[]} />);

    expect(screen.getByText("No notifications yet")).toBeInTheDocument();
  });

  it("calls onItemClick callback after navigation", async () => {
    const onItemClick = vi.fn();
    const user = userEvent.setup();
    render(
      <NotificationList
        notifications={[makeNotification()]}
        onItemClick={onItemClick}
      />
    );

    await user.click(screen.getByRole("button"));

    expect(onItemClick).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["new_episode"],
    ["summary_completed"],
  ])("renders Podcast icon (not FileText) for type=%s", (type) => {
    const { container } = render(
      <NotificationList
        notifications={[makeNotification({ type })]}
      />
    );

    // Podcast icon has lucide-podcast class; FileText icon has lucide-file-text
    expect(container.querySelector(".lucide-podcast")).toBeTruthy();
    expect(container.querySelector(".lucide-file-text")).toBeNull();
  });
});
