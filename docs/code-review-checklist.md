# Code Review Checklist

Rubric for reviewers (human and agent) and for contributors self-checking before pushing. Lives outside `AGENTS.md` so it isn't paid for on every agent invocation — pull it in on demand when preparing or reviewing a PR.

Scope: general code-review concerns surfaced across recent PRs. Each entry cites a concrete example so the rule is grounded, not abstract. See epic [#320](https://github.com/Chalet-Labs/contentgenie/issues/320) for the broader effort.

## 1. Accessibility patterns

**Rule.** Disclosure buttons need `aria-expanded` paired with `aria-controls` pointing at an `id` on the controlled region. Non-button interactive elements need explicit `role` + `tabIndex` **and** keyboard event handlers — `role`/`tabIndex` alone only makes the element focusable; Enter/Space activation must be wired explicitly via `onKeyDown`. Form controls need associated labels.

**Example — `aria-expanded` wired directly.** `src/components/ui/show-more-toggle.tsx:25`:

```tsx
<Button
  type="button"
  variant="ghost"
  className={cn("mt-2 w-full", className)}
  aria-expanded={expanded}
  onClick={onToggle}
>
```

`aria-expanded` is wired. **`aria-controls` is still missing** on `ShowMoreToggle` — the complement that points at the controlled list. Full pattern:

```tsx
<Button aria-expanded={expanded} aria-controls="topic-list">…</Button>
<ul id="topic-list">…</ul>
```

Track as follow-up; cite this section when fixing.

## 2. Magic numbers in production code

**Rule.** If a named constant is in scope or trivially extractable, use it. Applies equally to production code and tests. No lint rule enforces this today (the core `no-magic-numbers` rule isn't enabled), so reviewer judgment is the gate.

**Example.** `src/app/(app)/dashboard/page.tsx`:

- `:25` — `const RECOMMENDATIONS_FETCH_SIZE = 12;`
- `:78-79` — `await getRecommendedEpisodes(RECOMMENDATIONS_FETCH_SIZE)`

The refactor from `getRecommendedEpisodes(12)` → named constant is the canonical shape. Applies whether the constant is module-scoped (as above) or imported from a shared module.

## 3. Test anti-patterns

**Rule.**

- No tautological assertions (`firstChild !== null`, `result !== undefined`).
- Don't hardcode duplicates of source constants — assert against the imported constant.
- Cover boundary cases, not just happy paths.
- Verify round-trip state for components with state machines (expand → collapse → expand).
- Prefer accessible role queries or `data-testid` over CSS-class selectors — Tailwind utility classes change for purely visual reasons and will break tests that shouldn't care.

**Positive example — `data-testid`.** `src/components/dashboard/episode-recommendations.tsx:27` seeds `data-testid="episode-loading-row"`; `src/components/dashboard/__tests__/episode-recommendations.test.tsx:163` queries via `getAllByTestId("episode-loading-row")`. Decoupled from styling.

**Negative example (existing drift).** `src/components/dashboard/__tests__/trending-topics.test.tsx:62` uses `container.querySelectorAll("p.line-clamp-2")` — couples the test to a Tailwind utility. Worth migrating to `data-testid` or an accessible query.

## 4. Upstream-transformation interaction tests

**Rule.** When a component gates UI on a _derived_ value (`deduped.length`, `filtered.length`, `visible.length`), include at least one test where the raw input count exceeds a threshold and the derived count does not. Guards against the recurring bug where the threshold is applied to raw input instead of the transformed data that's actually rendered.

**Example.** `src/components/dashboard/__tests__/trending-topics.test.tsx:282-298`:

```tsx
it("toggle button is absent when raw topics exceed threshold but deduped count does not", () => {
  const uniqueSlugs = Math.max(TOPICS_INITIAL - 1, 1);
  const uniqueTopics = Array.from({ length: uniqueSlugs }, (_, i) =>
    makeTopic({ name: `Topic ${i}`, slug: `topic-${i}` }),
  );
  const duplicates = Array.from({ length: 3 }, () =>
    makeTopic({ name: "Topic 0", slug: "topic-0" }),
  );
  const topics = [...uniqueTopics, ...duplicates];
  expect(topics.length).toBeGreaterThan(TOPICS_INITIAL);
  render(<TrendingTopics topics={topics} generatedAt={fixedDate} />);
  expect(
    screen.queryByRole("button", { name: /show/i }),
  ).not.toBeInTheDocument();
});
```

Raw count > threshold, deduped count ≤ threshold → toggle must stay hidden. Without this test, a future refactor that gates on `topics.length` instead of `deduped.length` slips through.

## 5. When to consolidate duplication

**Rule.** Extract only when **all four** hold:

1. Duplication is literal line-for-line (or structurally identical with trivial token substitution).
2. The abstraction shape is clear from both call sites — no "we'll figure out the interface later."
3. A shared behavioral contract has drifted or is newly introduced (e.g. a new `aria-expanded` rule that must not diverge between two cards).
4. The safety net is strong — TypeScript + tests cover the extraction surface.

Partial matches prefer inlined duplication over a leaky abstraction.

**Example — extraction warranted.** `<ShowMoreToggle>` (`src/components/ui/show-more-toggle.tsx`) + `useExpandable` (`src/hooks/use-expandable.ts`) extracted across:

- `src/components/dashboard/trending-topics.tsx:38,85` (hook call, component render)
- `src/components/dashboard/episode-recommendations.tsx:51,164` (hook call, component render)

All four conditions held — `aria-expanded` was the newly-introduced contract that would otherwise have drifted between the two dashboard cards.

**Counterpoint.** "Rule of three" is a guard against premature abstraction of an _unknown_ shape. It is not a blanket license to defer obvious consolidation when the shape is clear from two call sites and a behavioral contract is at stake. Do not cite rule-of-three to punt on condition (3).

---

## Keeping this checklist alive

- If a reviewer catches something not in here, add it in the same PR — the checklist is a living doc, not a quarterly chore.
- **Planned — scheduled cross-PR sweeps:** an `update-review-checklist` skill will cluster merged-PR review comments and propose additions here. Tracked in [rube-de/cc-skills#216](https://github.com/rube-de/cc-skills/issues/216); not yet implemented.
- **Planned — `pre-pr-validation` integration:** this checklist will be loaded as a rubric before Codex review / `/pr-review-toolkit` / `/simplify` run. Tracked in [#367](https://github.com/Chalet-Labs/contentgenie/issues/367); not yet wired up.
