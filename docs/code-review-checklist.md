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

Per §7, any future PR that touches `ShowMoreToggle` or one of its consumers must wire `aria-controls` in that PR — the gap is in-scope as soon as the diff puts that component under the reviewer's nose. Cite this section when fixing.

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

**Reviewers MUST flag duplication that meets all four §5 conditions and require it fixed in the PR introducing or extending it. They MUST NOT defer it to a follow-up issue** — see §7 for the reviewer-scope contract this enforces.

**Bad — defer to follow-up (flagged).** _(Reviewer comment, PR #417 thread.)_

> "All four §5 conditions hold here, but I'd open a follow-up issue rather than block the PR if the team prefers to land the fixtures first."

The "follow-up issue" is the punt §5 forbids. The duplication is in-scope by definition (the PR introduces it) and the fix is mechanical (§5 condition 4 = strong safety net). "Follow-up" here is a synonym for "permanent."

**Good — extract in-PR (preferred).**

> "Conditions 1–4 of §5 all hold (literal duplication, clear shape, shared contract, TS+tests cover the surface). Extracting in this PR — the fix is mechanical and in-scope."

---

## 6. Grep before writing a new helper

Section 5 tells you when to extract _noticed_ duplication. This section is about not creating it in the first place.

**Rule.** Before adding a function that:

- Performs a SQL operation against a known table,
- Wraps a common utility (vector formatting, lock-key building, label normalization, advisory-lock acquisition),
- Mirrors a name pattern already used elsewhere (`forceX` next to an existing `X`, `internalY` next to a public `Y`),

grep the codebase for the SQL fragment, the table name, or the operation. Examples:

```
rg -n "INSERT INTO canonical_topics"
rg -n "function (build|format|normalize)\w+"
rg -n "pg_advisory_xact_lock"
```

If a private helper (`function`, not `export function`) already exists in a sibling module, **promote it to `export` rather than recreating it**. A `forceX` / `internalX` prefix on a byte-identical implementation is a smell — the "force" or "internal" semantic almost always belongs at the _call site_, not on a parallel copy of the helper.

**Why this section exists.** PR #412 (canonical-topic resolver integration) shipped with six near-identical helper pairs — `forceUpsertAliases`/`upsertAliases`, `forceUpdateLastSeen`/`updateLastSeen`, `forceInsertCanonical`/`insertCanonical`, `forceExactLookup`/`exactLookup`, plus duplicated `formatVector` and `buildLockKey`. Root cause: the resolver's SQL helpers in `src/lib/entity-resolution.ts` were declared as private `function`s, so the orchestrator integration in `src/trigger/helpers/database.ts` recreated them with a `force` prefix instead of promoting the originals to exports. Pre-PR multi-tool review (Codex, `/pr-review-toolkit:review-pr all`, `/simplify`) missed all six because `/simplify`'s reuse pass is diff-scoped — it does not grep the wider codebase for similar SQL or helper patterns.

**Diagnostic for reviewers.** When you see a new helper named `forceX` / `internalX` / `legacyX`, ask: "is this byte-identical to an existing `X`?" If yes, the right fix is a single `export` + import, not a parallel implementation.

---

## 7. Reviewer scope: fix-now vs. defer-to-follow-up

Code review exists to fix issues at hand. "Defer to a follow-up issue" is a tool with a narrow legitimate use, not a default escape hatch.

**In-scope by default.** Anything the PR introduces, modifies, or extends is in-scope for review and fix in that same PR. If a reviewer noticed it because it is visible in the diff (including context lines), the fix is considered in-scope by default, subject to the deferral criteria below. Duplication added or extended by the diff is in-scope. I noticed it = fix it here.

**Legitimately deferrable.** A finding is deferrable to a follow-up issue only when **both** hold:

1. The fix would touch files outside the PR's stated scope (e.g., an unrelated refactor in a sibling module the PR does not modify).
2. The fix is not required by the change under review (the PR does not introduce, extend, or rely on the broken behavior).

**Cross-link to §5.** When §5's four conditions hold for duplication that the PR introduces or extends, the fix is in-scope by definition — extract in-PR, do not defer.

**Why this section exists.** PR #417 surfaced reviewers deferring §5-eligible duplication via "follow-up issue" or "needs a third consumer" framing, even after concluding all four §5 conditions held. The §5 counterpoint existed but wasn't load-bearing. This section makes the contract explicit so reviewers and authors share the same default.

---

## Keeping this checklist alive

- If a reviewer catches something not in here, add it in the same PR — the checklist is a living doc, not a quarterly chore.
- **Planned — scheduled cross-PR sweeps:** an `update-review-checklist` skill will cluster merged-PR review comments and propose additions here. Tracked in [rube-de/cc-skills#216](https://github.com/rube-de/cc-skills/issues/216); not yet implemented.
- **`pre-pr-validation` integration:** this checklist is loaded in Phase 2.0 of [`.claude/skills/pre-pr-validation/SKILL.md`](../.claude/skills/pre-pr-validation/SKILL.md) and threaded into Codex review, `/pr-review-toolkit:review-pr all`, and `/simplify` as a supplementary rubric (each layer keeps its existing scope). Reviewers are asked to cite section numbers as `[checklist §N]`. Graceful skip if the file is missing. Wired up in [#367](https://github.com/Chalet-Labs/contentgenie/issues/367).
