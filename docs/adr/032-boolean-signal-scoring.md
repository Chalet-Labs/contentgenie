# ADR-032: Boolean Signal Hybrid Scoring

**Status:** Accepted
**Date:** 2026-04-12

## Context

The existing worth-it scoring system asks the LLM to rate episodes on three numeric dimensions (uniqueness, actionability, timeValue) on a 1–10 scale, then averages them into a composite score. This approach has two structural problems:

1. **LLMs cannot calibrate absolute numeric scores reliably.** Asking a model to distinguish a "6" from a "7" on a subjective scale produces systematic inflation and poor inter-run consistency. Scores cluster around 6–8 regardless of actual content quality.
2. **"Uniqueness" is unjudgeable in isolation.** A single episode summary provides no corpus context — the model has no basis for assessing whether insights are unique relative to the broader podcast landscape.

The scoring system needs to shift from subjective numeric calibration to objective binary questions that LLMs can answer reliably.

## Decision

Replace the 3-dimension numeric scoring system with **8 boolean signal questions** plus a **constrained ±1 LLM adjustment**. The score formula becomes:

```
score = clamp(1 + count_of_true_signals + adjustment, 1, 10)
```

### The 8 signals

| Signal | Question |
|--------|----------|
| `hasActionableInsights` | Does the episode contain 3+ actionable insights? |
| `hasNearTermApplicability` | Could a listener apply something within a week? |
| `staysFocused` | Does the episode stay focused with low filler-to-content ratio? |
| `goesBeyondSurface` | Does it go beyond surface-level discussion? |
| `isWellStructured` | Is it well-structured and easy to follow? |
| `timeJustified` | Is the time investment justified by content density? |
| `hasConcreteExamples` | Does it include concrete examples, data, or evidence? |
| `hasExpertPerspectives` | Does it feature expert or practitioner perspectives? |

### Adjustment

After answering the signals, the LLM may apply a small adjustment:
- **-1**: Signals slightly overstate quality (e.g., technically structured but painfully boring)
- **0**: Signals accurately capture quality (default, used in most cases)
- **+1**: Signals slightly understate quality (e.g., a masterclass that transcends the checklist)

### Backward compatibility

The `worth_it_dimensions` column is an untyped JSON blob. A discriminated union with a `kind` field distinguishes formats:

- **New rows:** `{ kind: "signals", signals: {...}, adjustment, adjustmentReason }`
- **Old rows:** `{ uniqueness, actionability, timeValue }` (no `kind` field)

Detection: if `kind === "signals"`, use the new path; otherwise treat as legacy dimensions. No database migration is required — the column is `json` with no DB-level shape constraint.

### Score computation is server-side

The LLM returns the 8 boolean signals and the adjustment; the score is computed server-side via `computeSignalScore()`. The LLM never returns a numeric score in the new format. This eliminates prompt-score disagreements and makes scoring deterministic given the same signals.

## Trade-offs

### Discrete vs. continuous scores

Scores become discrete integers (1–10) instead of continuous decimals. This is acceptable because:
- The signal checklist provides the real qualitative detail — the number is a summary
- Integer scores are easier for users to reason about
- The old continuous scores were illusory precision — an averaged 7.33 vs. 7.00 carried no meaningful distinction

### Mixed-format display during transition

Old episodes retain their decimal scores (e.g., "7.3"). New episodes produce integer-like scores (e.g., "7.0"). The UI uses `toFixed(1)` for both. This is acceptable; over time, bulk-resummarize can migrate old episodes to the new format.

### Custom prompts may not return signals

Custom prompts (per ADR-028) bypass `getSummarizationPrompt()` entirely. The server-side score computation implements a 3-tier fallback:
1. If `worthItSignals` is present → compute score from signals (new path)
2. If `worthItDimensions` is present with old format → average dimensions (legacy path)
3. If neither → use raw `worthItScore` from LLM response (fallback)

This means custom prompt users see no change in behavior.

## Consequences

- **Existing thresholds remain valid.** The score distribution maps cleanly to existing tiers:
  - Exceptional (≥ 8): 7–8 signals — genuinely exceptional content
  - Above Average (≥ 6): 5–6 signals — solid, majority-positive content
  - Average (≥ 4): 3–4 signals — decent but unremarkable
  - Below Average (≥ 2): 1–2 signals — weak
  - Skip (< 2): 0 signals with zero/negative adjustment
- **Recommendation threshold (`SCORE_THRESHOLD = "6.00"`) is preserved.** Score ≥ 6 means 5+ signals fired — a majority of quality indicators.
- **Bulk-resummarize can migrate old episodes** to the new signal format. No urgent backfill is required.
- **`worthItReason` now includes structured signal information** — a compact summary of which signals fired and the adjustment justification.
- **No schema migration required.** The `worth_it_dimensions` JSON column and `worth_it_score` decimal column both accommodate the new format without changes.

## Related ADRs

- ADR-028: Admin panel architecture — custom prompt pipeline that this change must not break.
