import { describe, it, expect } from "vitest";
import { getScoreColor, getScoreLabel } from "@/lib/score-utils";

describe("getScoreColor", () => {
  it("returns bg-green-500 for scores >= 8", () => {
    expect(getScoreColor(8)).toBe("bg-green-500");
    expect(getScoreColor(9.5)).toBe("bg-green-500");
    expect(getScoreColor(10)).toBe("bg-green-500");
  });

  it("returns bg-emerald-500 for scores >= 6 and < 8", () => {
    expect(getScoreColor(6)).toBe("bg-emerald-500");
    expect(getScoreColor(7)).toBe("bg-emerald-500");
    expect(getScoreColor(7.9)).toBe("bg-emerald-500");
  });

  it("returns bg-yellow-500 for scores >= 4 and < 6", () => {
    expect(getScoreColor(4)).toBe("bg-yellow-500");
    expect(getScoreColor(5)).toBe("bg-yellow-500");
    expect(getScoreColor(5.9)).toBe("bg-yellow-500");
  });

  it("returns bg-orange-500 for scores >= 2 and < 4", () => {
    expect(getScoreColor(2)).toBe("bg-orange-500");
    expect(getScoreColor(3)).toBe("bg-orange-500");
    expect(getScoreColor(3.9)).toBe("bg-orange-500");
  });

  it("returns bg-red-500 for scores < 2", () => {
    expect(getScoreColor(0)).toBe("bg-red-500");
    expect(getScoreColor(1)).toBe("bg-red-500");
    expect(getScoreColor(1.9)).toBe("bg-red-500");
  });
});

describe("getScoreLabel", () => {
  it("returns 'Highly Recommended' for scores >= 8", () => {
    expect(getScoreLabel(8)).toBe("Highly Recommended");
    expect(getScoreLabel(10)).toBe("Highly Recommended");
  });

  it("returns 'Worth Your Time' for scores >= 6 and < 8", () => {
    expect(getScoreLabel(6)).toBe("Worth Your Time");
    expect(getScoreLabel(7.9)).toBe("Worth Your Time");
  });

  it("returns 'Decent' for scores >= 4 and < 6", () => {
    expect(getScoreLabel(4)).toBe("Decent");
    expect(getScoreLabel(5.9)).toBe("Decent");
  });

  it("returns 'Skip Unless Interested' for scores >= 2 and < 4", () => {
    expect(getScoreLabel(2)).toBe("Skip Unless Interested");
    expect(getScoreLabel(3.9)).toBe("Skip Unless Interested");
  });

  it("returns 'Not Recommended' for scores < 2", () => {
    expect(getScoreLabel(0)).toBe("Not Recommended");
    expect(getScoreLabel(1.9)).toBe("Not Recommended");
  });
});
