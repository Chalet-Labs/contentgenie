import { describe, it, expect } from "vitest";
import {
  getScoreColor,
  getScoreLabel,
  getScoreBand,
  clampAdjustment,
  coerceSignals,
  computeSignalScore,
} from "@/lib/score-utils";
import { WORTH_IT_SIGNAL_KEYS } from "@/lib/openrouter";
import type { WorthItSignals } from "@/lib/openrouter";

/** Helper: create a WorthItSignals object with all signals set to `value`. */
function allSignals(value: boolean): WorthItSignals {
  return coerceSignals(
    Object.fromEntries(WORTH_IT_SIGNAL_KEYS.map((k) => [k, value]))
  );
}

/** Helper: create signals with the first `n` keys true, rest false. */
function nTrueSignals(n: number): WorthItSignals {
  return coerceSignals(
    Object.fromEntries(WORTH_IT_SIGNAL_KEYS.map((k, i) => [k, i < n]))
  );
}

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

describe("getScoreBand", () => {
  it("returns 'exceptional' for scores >= 8", () => {
    expect(getScoreBand(8)).toBe("exceptional");
    expect(getScoreBand(9.5)).toBe("exceptional");
    expect(getScoreBand(10)).toBe("exceptional");
  });

  it("returns 'above' for scores >= 6 and < 8", () => {
    expect(getScoreBand(6)).toBe("above");
    expect(getScoreBand(7.9)).toBe("above");
  });

  it("returns 'average' for scores >= 4 and < 6", () => {
    expect(getScoreBand(4)).toBe("average");
    expect(getScoreBand(5.9)).toBe("average");
  });

  it("returns 'below' for scores >= 2 and < 4", () => {
    expect(getScoreBand(2)).toBe("below");
    expect(getScoreBand(3.9)).toBe("below");
  });

  it("returns 'skip' for scores < 2", () => {
    expect(getScoreBand(0)).toBe("skip");
    expect(getScoreBand(1.9)).toBe("skip");
  });

  it("agrees with getScoreColor and getScoreLabel on every band boundary", () => {
    const EXPECTED_LABEL = {
      exceptional: "Exceptional",
      above: "Above Average",
      average: "Average",
      below: "Below Average",
      skip: "Skip",
    } as const;
    const boundaries = [10, 8, 7.9, 6, 5.9, 4, 3.9, 2, 1.9, 0];
    for (const s of boundaries) {
      const band = getScoreBand(s);
      expect(getScoreColor(s)).toContain(`bg-score-${band}`);
      expect(getScoreLabel(s)).toBe(EXPECTED_LABEL[band]);
    }
  });
});

describe("clampAdjustment", () => {
  it("passes through -1, 0, and 1 unchanged", () => {
    expect(clampAdjustment(-1)).toBe(-1);
    expect(clampAdjustment(0)).toBe(0);
    expect(clampAdjustment(1)).toBe(1);
  });

  it("clamps values above 1 to 1", () => {
    expect(clampAdjustment(5)).toBe(1);
    expect(clampAdjustment(100)).toBe(1);
  });

  it("clamps values below -1 to -1", () => {
    expect(clampAdjustment(-3)).toBe(-1);
    expect(clampAdjustment(-100)).toBe(-1);
  });

  it("rounds fractional values to nearest integer then clamps", () => {
    expect(clampAdjustment(0.7)).toBe(1);
    expect(clampAdjustment(0.4)).toBe(0);
    expect(clampAdjustment(-0.6)).toBe(-1);
    // Math.round(-0.4) === -0 in JS; both -0 and +0 are valid as adjustment 0
    expect(clampAdjustment(-0.4)).toBe(-0);
  });

  it("returns 0 for undefined", () => {
    expect(clampAdjustment(undefined)).toBe(0);
  });

  it("returns 0 for string values", () => {
    expect(clampAdjustment("foo")).toBe(0);
    expect(clampAdjustment("1")).toBe(0);
  });

  it("returns 0 for NaN", () => {
    expect(clampAdjustment(NaN)).toBe(0);
  });

  it("returns 0 for null", () => {
    expect(clampAdjustment(null)).toBe(0);
  });
});

describe("coerceSignals", () => {
  it("returns identity when all values are booleans", () => {
    const input = {
      hasActionableInsights: true,
      hasNearTermApplicability: false,
      staysFocused: true,
      goesBeyondSurface: false,
      isWellStructured: true,
      timeJustified: false,
      hasConcreteExamples: true,
      hasExpertPerspectives: false,
    };
    expect(coerceSignals(input)).toEqual(input);
  });

  it("coerces recognized non-boolean values correctly", () => {
    const result = coerceSignals({
      hasActionableInsights: 1,            // number 1 → true
      hasNearTermApplicability: "true",    // string "true" → true
      staysFocused: "TRUE",               // case-insensitive → true
      goesBeyondSurface: 0,               // number 0 → false
      isWellStructured: "false",           // string "false" → false
      timeJustified: "yes",               // unrecognized string → false
      hasConcreteExamples: 42,            // number ≠ 1 → false
      hasExpertPerspectives: null,        // null → false
    });
    expect(result.hasActionableInsights).toBe(true);
    expect(result.hasNearTermApplicability).toBe(true);
    expect(result.staysFocused).toBe(true);
    expect(result.goesBeyondSurface).toBe(false);
    expect(result.isWellStructured).toBe(false);
    expect(result.timeJustified).toBe(false);
    expect(result.hasConcreteExamples).toBe(false);
    expect(result.hasExpertPerspectives).toBe(false);
  });

  it("coerces string 'false' to false (not truthy like Boolean())", () => {
    const result = coerceSignals({
      hasActionableInsights: "false",
      hasNearTermApplicability: "FALSE",
      staysFocused: " False ",
      goesBeyondSurface: false,
      isWellStructured: false,
      timeJustified: false,
      hasConcreteExamples: false,
      hasExpertPerspectives: false,
    });
    for (const key of WORTH_IT_SIGNAL_KEYS) {
      expect(result[key]).toBe(false);
    }
  });

  it("coerces falsy non-boolean values to false", () => {
    const result = coerceSignals({
      hasActionableInsights: 0,
      hasNearTermApplicability: "",
      staysFocused: null,
      goesBeyondSurface: undefined,
      isWellStructured: false,
      timeJustified: false,
      hasConcreteExamples: false,
      hasExpertPerspectives: false,
    });
    for (const key of WORTH_IT_SIGNAL_KEYS) {
      expect(result[key]).toBe(false);
    }
  });

  it("defaults missing keys to false", () => {
    const result = coerceSignals({});
    for (const key of WORTH_IT_SIGNAL_KEYS) {
      expect(result[key]).toBe(false);
    }
  });

  it("ignores extra keys not in the signal list", () => {
    const result = coerceSignals({
      hasActionableInsights: true,
      unknownKey: true,
      anotherExtra: "value",
    });
    expect(result.hasActionableInsights).toBe(true);
    expect(Object.hasOwn(result, "unknownKey")).toBe(false);
    expect(Object.hasOwn(result, "anotherExtra")).toBe(false);
  });
});

describe("computeSignalScore", () => {
  it("returns 9 when all 8 signals are true with adjustment 0", () => {
    expect(computeSignalScore(allSignals(true), 0)).toBe(9);
  });

  it("returns 1 when all signals are false with adjustment 0", () => {
    expect(computeSignalScore(allSignals(false), 0)).toBe(1);
  });

  it("computes 1 + trueCount + adjustment for mixed signals", () => {
    expect(computeSignalScore(nTrueSignals(5), 1)).toBe(7);
    expect(computeSignalScore(nTrueSignals(3), 0)).toBe(4);
    expect(computeSignalScore(nTrueSignals(6), -1)).toBe(6);
  });

  it("clamps to minimum of 1 (0 true signals + adjustment -1)", () => {
    expect(computeSignalScore(allSignals(false), -1)).toBe(1);
  });

  it("clamps to maximum of 10 (8 true signals + adjustment +1)", () => {
    expect(computeSignalScore(allSignals(true), 1)).toBe(10);
  });

  it("internally clamps out-of-range adjustments via clampAdjustment", () => {
    // adjustment 5 should be clamped to 1
    expect(computeSignalScore(nTrueSignals(4), 5)).toBe(6);
    // adjustment -10 should be clamped to -1
    expect(computeSignalScore(nTrueSignals(4), -10)).toBe(4);
  });

  it("produces correct scores for each signal count with adjustment 0", () => {
    for (let n = 0; n <= 8; n++) {
      expect(computeSignalScore(nTrueSignals(n), 0)).toBe(1 + n);
    }
  });
});
