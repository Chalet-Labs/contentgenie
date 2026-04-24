import { describe, it, expect } from "vitest";
import { interpolatePrompt } from "@/lib/admin/prompt-utils";

describe("interpolatePrompt", () => {
  const baseVars = {
    title: "Test Episode",
    podcastName: "Test Podcast",
    description: "A great episode",
    duration: 3600, // 60 minutes
    transcript: "This is the transcript text.",
  };

  it("interpolates all known placeholders", () => {
    const template =
      "{{title}} from {{podcastName}}: {{description}} ({{duration}} min)\n{{transcript}}";
    const result = interpolatePrompt(template, baseVars);
    expect(result).toBe(
      "Test Episode from Test Podcast: A great episode (60 min)\nThis is the transcript text.",
    );
  });

  it("converts duration to minutes (integer, rounded)", () => {
    const template = "{{duration}}";
    expect(interpolatePrompt(template, { ...baseVars, duration: 3661 })).toBe(
      "61",
    );
    expect(interpolatePrompt(template, { ...baseVars, duration: 90 })).toBe(
      "2",
    );
    expect(interpolatePrompt(template, { ...baseVars, duration: 0 })).toBe("0");
  });

  it("passes through unknown {{x}} tokens unchanged", () => {
    const template = "{{title}} {{unknown}} {{another}}";
    const result = interpolatePrompt(template, baseVars);
    expect(result).toBe("Test Episode {{unknown}} {{another}}");
  });

  it("replaces multiple occurrences of the same placeholder", () => {
    const template = "{{title}} and {{title}} again";
    const result = interpolatePrompt(template, baseVars);
    expect(result).toBe("Test Episode and Test Episode again");
  });

  it("returns empty string for empty template", () => {
    expect(interpolatePrompt("", baseVars)).toBe("");
  });

  it("handles transcript placeholder", () => {
    const template = "Analyze: {{transcript}}";
    const result = interpolatePrompt(template, {
      ...baseVars,
      transcript: "Hello world",
    });
    expect(result).toBe("Analyze: Hello world");
  });
});
