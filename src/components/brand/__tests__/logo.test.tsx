import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Logo } from "@/components/brand/logo";

describe("Logo", () => {
  it("renders with role=img and default aria-label", () => {
    const { container } = render(<Logo />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("ContentGenie");
  });

  it("uses a custom label when provided", () => {
    const { container } = render(<Logo label="Home" />);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toBe("Home");
  });

  it("renders aria-hidden and no role when decorative", () => {
    const { container } = render(<Logo decorative />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("role")).toBeNull();
    expect(svg.getAttribute("aria-label")).toBeNull();
  });

  it("applies size to mark variants as a square", () => {
    const { container } = render(<Logo size={48} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("48");
    expect(svg.getAttribute("height")).toBe("48");
    expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
  });

  it("renders mark-mono variant with a 32-unit viewBox", () => {
    const { container } = render(<Logo variant="mark-mono" size={32} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 32 32");
    expect(svg.getAttribute("width")).toBe("32");
  });

  it("renders lockup variant with a 210×44 viewBox and scaled width", () => {
    const { container } = render(<Logo variant="lockup" size={44} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 210 44");
    expect(svg.getAttribute("height")).toBe("44");
    // width = size * 210 / 44
    expect(svg.getAttribute("width")).toBe("210");
  });

  it("forwards className through cn()", () => {
    const { container } = render(<Logo className="custom-class" />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("custom-class");
    expect(svg.getAttribute("class")).toContain("shrink-0");
  });
});
