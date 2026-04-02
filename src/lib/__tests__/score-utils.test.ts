import { describe, it, expect } from "vitest";
import { getScoreColor, getScoreLabel } from "@/lib/score-utils";

describe("getScoreColor", () => {
  it("returns exceptional colors for scores >= 8", () => {
    expect(getScoreColor(8)).toBe("bg-score-exceptional text-score-exceptional-foreground");
    expect(getScoreColor(9.5)).toBe("bg-score-exceptional text-score-exceptional-foreground");
    expect(getScoreColor(10)).toBe("bg-score-exceptional text-score-exceptional-foreground");
  });

  it("returns above colors for scores >= 6 and < 8", () => {
    expect(getScoreColor(6)).toBe("bg-score-above text-score-above-foreground");
    expect(getScoreColor(7)).toBe("bg-score-above text-score-above-foreground");
    expect(getScoreColor(7.9)).toBe("bg-score-above text-score-above-foreground");
  });

  it("returns average colors for scores >= 4 and < 6", () => {
    expect(getScoreColor(4)).toBe("bg-score-average text-score-average-foreground");
    expect(getScoreColor(5)).toBe("bg-score-average text-score-average-foreground");
    expect(getScoreColor(5.9)).toBe("bg-score-average text-score-average-foreground");
  });

  it("returns below colors for scores >= 2 and < 4", () => {
    expect(getScoreColor(2)).toBe("bg-score-below text-score-below-foreground");
    expect(getScoreColor(3)).toBe("bg-score-below text-score-below-foreground");
    expect(getScoreColor(3.9)).toBe("bg-score-below text-score-below-foreground");
  });

  it("returns skip colors for scores < 2", () => {
    expect(getScoreColor(0)).toBe("bg-score-skip text-score-skip-foreground");
    expect(getScoreColor(1)).toBe("bg-score-skip text-score-skip-foreground");
    expect(getScoreColor(1.9)).toBe("bg-score-skip text-score-skip-foreground");
  });
});

describe("getScoreLabel", () => {
  it("returns 'Exceptional' for scores >= 8", () => {
    expect(getScoreLabel(8)).toBe("Exceptional");
    expect(getScoreLabel(10)).toBe("Exceptional");
  });

  it("returns 'Above Average' for scores >= 6 and < 8", () => {
    expect(getScoreLabel(6)).toBe("Above Average");
    expect(getScoreLabel(7.9)).toBe("Above Average");
  });

  it("returns 'Average' for scores >= 4 and < 6", () => {
    expect(getScoreLabel(4)).toBe("Average");
    expect(getScoreLabel(5.9)).toBe("Average");
  });

  it("returns 'Below Average' for scores >= 2 and < 4", () => {
    expect(getScoreLabel(2)).toBe("Below Average");
    expect(getScoreLabel(3.9)).toBe("Below Average");
  });

  it("returns 'Skip' for scores < 2", () => {
    expect(getScoreLabel(0)).toBe("Skip");
    expect(getScoreLabel(1.9)).toBe("Skip");
  });
});
