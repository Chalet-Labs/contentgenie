import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("manifest", () => {
  const result = manifest();

  it("returns correct app name", () => {
    expect(result.name).toBe("ContentGenie");
    expect(result.short_name).toBe("ContentGenie");
  });

  it("uses standalone display mode", () => {
    expect(result.display).toBe("standalone");
  });

  it("starts at root URL", () => {
    expect(result.start_url).toBe("/");
  });

  it("includes required icon sizes", () => {
    const icons = result.icons;
    expect(icons).toBeDefined();
    expect(icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      ])
    );
  });

  it("includes a maskable icon", () => {
    const maskable = result.icons?.find((icon) =>
      typeof icon === "object" && "purpose" in icon && icon.purpose === "maskable"
    );
    expect(maskable).toBeDefined();
    expect(maskable).toEqual(
      expect.objectContaining({ sizes: "512x512", type: "image/png" })
    );
  });

  it("sets brand colors (paper bg + amber theme, 2026 palette)", () => {
    expect(result.background_color).toBe("#FCFDFC");
    expect(result.theme_color).toBe("#F59E0B");
  });
});
