import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ServiceWorkerRegistrar } from "@/components/pwa/service-worker-registrar";

describe("ServiceWorkerRegistrar", () => {
  let originalServiceWorker: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalServiceWorker = Object.getOwnPropertyDescriptor(
      navigator,
      "serviceWorker"
    );
  });

  afterEach(() => {
    if (originalServiceWorker) {
      Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
    } else {
      // Remove the override so the prototype value is visible again
      delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("registers the service worker in production when available", () => {
    vi.stubEnv("NODE_ENV", "production");
    const registerMock = vi.fn().mockResolvedValue({ scope: "/" });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      writable: true,
      configurable: true,
    });

    render(<ServiceWorkerRegistrar />);

    expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("does not register when NODE_ENV is not production", () => {
    const registerMock = vi.fn().mockResolvedValue({ scope: "/" });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      writable: true,
      configurable: true,
    });

    render(<ServiceWorkerRegistrar />);

    expect(registerMock).not.toHaveBeenCalled();
  });

  it("does not call register when serviceWorker is falsy", () => {
    vi.stubEnv("NODE_ENV", "production");
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    // Should render without error
    const { container } = render(<ServiceWorkerRegistrar />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing", () => {
    vi.stubEnv("NODE_ENV", "production");
    const registerMock = vi.fn().mockResolvedValue({ scope: "/" });
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: registerMock },
      writable: true,
      configurable: true,
    });

    const { container } = render(<ServiceWorkerRegistrar />);
    expect(container.innerHTML).toBe("");
  });
});
