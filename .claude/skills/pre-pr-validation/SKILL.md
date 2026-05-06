---
name: pre-pr-validation
description: Use before any `gh pr create` — invoke as soon as the user asks to open, create, submit, or file a pull request. Runs the full pre-PR pipeline: rebase onto main, build, parallel multi-tool review, auto-fix every valid finding, re-verify, push, then open the PR. A PreToolUse hook blocks `gh pr create` until this skill writes a fresh validation sentinel, so triggering proactively whenever PRs are mentioned avoids the bounce.
---

# Pre-PR Validation

## How this is enforced

A PreToolUse hook guards `gh pr create` until `.claude/.pr-validated` contains the current branch + HEAD SHA. The sentinel invalidates on any HEAD change, so any commit after running the skill forces a re-run.

Invoke proactively the moment a PR is discussed — don't wait for the hook to reject.

## Run inline — do not wrap the pipeline in a subagent

Run inline in the calling session. Phase 2.1 dispatches a background `Task` for Codex and `/pr-review-toolkit:review-pr all` spawns further `Task` calls for each specialist. Subagents can't spawn further subagents, so wrapping this skill in an outer Task blocks Codex and may break the toolkit reviewers.

**Phase 4a is an explicit scoped sub-delegation** (not a violation): foreground Sonnet for mechanical fixes only, synchronous, no nested subagents. See Phase 4a.

## Unattended execution policy (read before Phase 3)

After Phase 2 returns findings, **do not stop to ask the user for approval before fixing them.** Validate each finding (Phase 3), then apply every valid fix (Phase 4) in one continuous run. The user has already opted into this policy by invoking the skill — pausing to triage defeats the point.

Exceptions (the only times you stop):
- A finding requires judgement the skill can't make (e.g., "rename this product concept" — ask).
- Two reviewers propose opposite changes and project conventions don't resolve it.
- The fix would touch code outside the PR's stated scope in a way that surprises the caller.

"This feels like a lot of changes" is not an exception.

## The Pipeline

Run phases in order.

### Phase 0 — Sync with origin/main

Rebase the branch onto the current `origin/main` so the PR reflects reality:

```bash
git fetch origin main
git rebase origin/main
```

A branch behind main can pass local verification but fail CI after the PR opens — rebasing now is cheaper than surfacing conflicts later. If the rebase produces conflicts that aren't trivially mechanical, stop and surface to the user; don't guess at a resolution.

### Phase 1 — Verification Gate

Run fresh:

```bash
bun run build
```

Must exit 0. If it fails, fix the root cause (not a suppression, not a workaround) and re-run. Don't enter Phase 2 with a red build — reviewers waste cycles on broken code.

Build only — Husky pre-commit covers tsc/lint/test on new commits, leaving page-export errors as the gap. If Phase 0 rebased (history rewrote, `HEAD@{1}` ≠ `HEAD`), pre-commit didn't fire on those reapplied commits — also run `bun run lint` and `bun run test` here.

### Phase 2 — Multi-Tool Review

#### Phase 2.0 — Load review checklist (rubric)

Read `docs/code-review-checklist.md` from the repo root via the Read tool **before** launching reviewers, so the content lives in conversation context for the rest of Phase 2 and propagates into Skill-spawned subagent prompts.

If the file does not exist:

- Print a one-line warning: `WARNING: docs/code-review-checklist.md not found — proceeding without rubric injection`.
- Continue to Phase 2.1 with no rubric loaded. Do **not** fail the pipeline.

The rubric is **additive**: every reviewer keeps its existing specialty; the rubric runs as a supplementary pass on top. Both rubric-derived and specialty-derived findings should appear in Phase 3.

#### Phase 2.1 — Launch reviewers in parallel

Launch three reviews in parallel (one message, three independent tool calls). Each invocation must explicitly frame the rubric as supplementary and instruct the reviewer to cite section numbers (`[checklist §N]`) for any rubric-derived finding. If the checklist was not found in Phase 2.0, omit the rubric block and the framing line — the reviewer runs in baseline mode.

1. **Codex review** — dispatch a `Task` subagent with `run_in_background: true` to run `codex review --base main` via Bash. The background flag lets the orchestrator proceed without waiting; you'll be notified on completion.

   ```
   Task({
     subagent_type: "general-purpose",
     description: "Codex review vs main",
     run_in_background: true,
     prompt: `Run \`codex review --base main\` from <absolute repo path> via Bash. Return findings as file:line, issue, suggested fix. If the CLI errors (auth, network, missing binary), report the failure verbatim.

   In addition to relaying Codex's findings, evaluate the diff against the supplementary code-review checklist below as a rubric. Cite the section number (e.g. \`[checklist §3]\`) for any rubric-derived finding. Do NOT suppress or filter Codex's own findings based on the rubric — both sources contribute. Reviewers MUST NOT defer duplication-extraction findings that meet all four §5 conditions to a follow-up issue — the fix is in-scope for this PR (see §7). If no rubric block follows, skip this rubric pass and just relay Codex.

   --- BEGIN RUBRIC: docs/code-review-checklist.md ---
   <full file content from Phase 2.0 here, or omit this block entirely if Phase 2.0 found the file missing>
   --- END RUBRIC ---`
   })
   ```

2. `/pr-review-toolkit:review-pr all` — code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, comment-analyzer, code-simplifier. **Immediately before** the Skill call, type the following directive into the conversation so it's salient when the slash command's spawned subagent prompts are constructed:

   > Apply `docs/code-review-checklist.md` (loaded above in Phase 2.0) as a **supplementary rubric** for every reviewer subagent — in addition to each subagent's normal specialty (CLAUDE.md compliance, test coverage, silent failures, type design, comments, simplification). The rubric does not replace or narrow any existing review scope; both rubric-derived and specialty-derived findings should appear. Cite section numbers in rubric-derived findings (`[checklist §N]`). Reviewers MUST NOT defer duplication-extraction findings that meet all four §5 conditions to a follow-up issue — the fix is in-scope for this PR (see §7).

3. `/simplify` — reuse/quality/efficiency pass. **Immediately before** the Skill call, type:

   > Apply `docs/code-review-checklist.md` as a **supplementary rubric** alongside the normal `/simplify` reuse/quality/efficiency pass — both contribute findings; the rubric does not narrow scope. Section 5 (consolidation conditions) is especially load-bearing for this layer — do not defer obvious extractions behind "rule of three" when all four conditions hold, and MUST NOT defer such findings to a follow-up issue (the fix is in-scope for this PR; see §7). Cite section numbers (`[checklist §N]`) in rubric-derived findings.

Launch all three in the same message. Don't enter Phase 3 until the Codex task callback arrives and both Skill calls have returned. Don't run `codex:setup` — it's one-time init, not part of the pipeline.

### Phase 3 — Collect & Validate Findings

For every finding from every tool:

1. **Verify the claim.** Read the cited file and line. Does the problem actually exist as described? Reject hallucinations, stale line numbers, and refs to code that no longer exists.
2. **Check for conflicts.** If two tools propose opposite changes, apply project conventions (AGENTS.md, CLAUDE.md, user memory) to pick one. Record the decision in the finding.
3. **Mark valid or invalid.** A finding is valid if the claim is technically correct on the current code. Severity (critical/important/suggestion) does *not* affect validity — all valid findings get fixed.
4. **Classify each valid finding as `mechanical` or `judgment`** so Phase 4 can route it correctly:
   - **Mechanical:** the fix is a fully-specified `file:line → exact replacement` edit with no design decisions. Examples: comment text fixes, `console.warn` additions, hardcoded constant → import, brand-cast removals, doc-comment additions, line-number rot, deleting a WHAT-only comment, importing an existing helper instead of duplicating it.
   - **Judgment:** the fix requires reviewer-context to land well. Examples: extracting a new component or hook (props/signature design), tightening a type to forbid illegal states, choosing a test seam, reconciling conflicting reviewer suggestions, anything where the reviewer wrote "consider" or "options:" rather than a single concrete patch.
   - When in doubt, classify as `judgment`. Mis-routing mechanical work as judgment costs nothing; mis-routing judgment work as mechanical produces a wrong fix.

Don't skip a finding because it seems minor. Per the unattended execution policy above, every valid finding goes straight to Phase 4 without an approval pause.

### Phase 4 — Apply Fixes

Findings split by classification (Phase 3 step 4): mechanical → Phase 4a (Sonnet subagent), judgment → Phase 4b (inline). The orchestrator decides ordering — typically run 4a first to clear noise, then 4b inline.

Group related fixes into logical commits following the project commit convention:

```
type: Description
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`.

Per user memory, commit messages should not mention Claude, AI, or automated generation — focus on the technical change and business value.

#### Phase 4a — Mechanical fixes (Sonnet subagent)

When the mechanical bucket has ≥3 findings, dispatch a foreground Sonnet subagent to apply them. Below 3, just do them inline — the prompt overhead isn't worth it.

```
Task({
  subagent_type: "general-purpose",
  description: "Apply mechanical PR-review fixes",
  model: "sonnet",
  prompt: `Apply the following mechanical edits in <absolute repo path>. Each one is a fully-specified replacement — do NOT redesign, do NOT pick between alternatives, do NOT expand scope. If any edit looks ambiguous or the cited file:line no longer matches, STOP and report which finding(s) you skipped and why — the orchestrator will handle them in Phase 4b.

Edits to apply (file:line | why | exact change):
1. <file>:<line> | <one-line rationale tying to the reviewer/checklist citation> | <unambiguous instruction, e.g. "replace 'foo' with 'bar'", "add line X after line Y", "delete the JSDoc on lines N-M">
2. ...

After all edits:
- Run \`bun run lint\` once. If it fails, attempt minimal lint fixes (auto-import, semicolons). Do NOT silence rules.
- Do NOT run tsc, tests, or build — the orchestrator owns Phase 5 verification.
- Do NOT commit. Leave changes unstaged for the orchestrator to commit alongside Phase 4b work.
- Return a short summary: which edits applied cleanly, which were skipped (with reason), any lint follow-ups you did. No need to quote the diff — the orchestrator will inspect it.`
})
```

Foreground (not background) so 4b can plan around the diff. After the subagent returns, spot-check `git diff` for the affected files, then proceed to Phase 4b.

#### Phase 4b — Judgment fixes (inline)

Apply the remaining findings inline. The orchestrator has the full review context (Phase 2 reports, plan §Risks, project memory) and can make the design calls without re-passing all of it as a subagent prompt.

Typical Phase 4b work: API-shape refactors, new component or hook design, type tightenings that change call-site shape, conflict resolution between reviewers.

After Phase 4b, stage all changes (subagent + orchestrator), run `bun run format` if Prettier flagged anything during the pre-commit dry-run, commit, and proceed to Phase 5.

### Phase 5 — Re-Verify

```bash
bun run build
```

Must exit 0. Phase 4's commits already triggered the pre-commit hook (tsc + lint + test), so only the build gap needs re-checking here.

If build fails, loop back to Phase 3 for the regressing finding (was it valid? is the fix correct?). Cap retries at 2. If still failing after 2 retries, stop and surface to the user with the specific failure — don't write the sentinel.

### Phase 6 — Push the Branch

Push to `origin`. `gh pr create` needs the branch available on the remote, and the sentinel should reflect a state that exists both locally and remotely.

```bash
git push -u origin HEAD
```

If the push is rejected (non-fast-forward), rebase onto the current `origin/<branch>` and re-run Phase 5 before retrying. Don't force-push without cause.

### Phase 7 — Write Sentinel

Once Phase 5 is green and Phase 6 has pushed, write the sentinel **atomically** (tmp+mv) so a racing hook read can't see a half-written file:

```bash
repo_root=$(git rev-parse --show-toplevel)
branch=$(git rev-parse --abbrev-ref HEAD)
sha=$(git rev-parse HEAD)
sentinel="$repo_root/.claude/.pr-validated"
mkdir -p "$repo_root/.claude"
printf '%s %s\n' "$branch" "$sha" > "$sentinel.tmp" && mv "$sentinel.tmp" "$sentinel"
```

`.claude/.pr-validated` is gitignored. Write it last — any commit after this invalidates it.

### Phase 8 — Create the PR

Now `gh pr create` is allowed. Use the project's standard PR template:

```
## Summary
- bullets

## Test plan
- [ ] checklist items
```

Title: `type: Description`, under 70 characters, same convention as commits. Use `--repo Chalet-Labs/contentgenie` per user memory.

## Non-obvious rules

- **Verification is fresh-only.** Re-run `bun run build` in this session — previous runs don't count. The sentinel is a completion claim.
- **Rubric propagation is hybrid.** Codex inlines the rubric in its `Task` prompt (background subagent has no shared context). The two slash commands rely on conversation salience. Smoke-test: look for `[checklist §N]` citations in Phase 3 — if absent, propagation regressed.
- **Phase 4a is bounded.** Mechanical edits only, foreground, no nested subagents, no commit. If a finding needs judgment, the subagent skips it and 4b picks it up — that's the intended path, not a bug.

## Failure modes

| Symptom | Action |
|---------|--------|
| Phase 0 rebase conflicts | If trivial, resolve and continue. If not, stop and surface to the user. |
| Phase 1 build fails | Fix root cause, re-run. Don't proceed. |
| `docs/code-review-checklist.md` missing in Phase 2.0 | Log a one-line warning and continue Phase 2 with no rubric injection. Reviewers run in baseline mode. Do **not** fail the pipeline. |
| Codex `Task` subagent stuck > 15 min | Abandon the background task, proceed with the remaining reviewers, and surface to user. |
| Reviewers disagree | Apply project conventions; document the choice in the finding. |
| Phase 5 fails after fixes | Retry up to 2×. Then surface with the specific failure. |
| Phase 6 push rejected (non-fast-forward) | Rebase onto current `origin/<branch>`, re-run Phase 5, retry push. No default force-push. |
| `/simplify` or `/pr-review-toolkit:review-pr` unavailable | Log it, continue with the remaining reviewers. Not fatal. |
| Phase 4a subagent reports skipped edits | Pull the skipped edits into Phase 4b and apply inline with full reviewer context. The subagent's "skip" is a feature, not a failure — it's how the boundary stays honest. |
| Phase 4a subagent makes a wrong edit (caught at Phase 5 build) | Inspect the diff, revert the bad edit, and re-apply inline as judgment work. Investigate whether the finding was misclassified at Phase 3 step 4 — the cause is almost always "mechanical-looking but actually needed context." |
| Hook fires on a legitimate command mentioning `gh pr create` | Known limitation — the regex is best-effort. Work around by invoking the real `gh pr create` after the skill completes normally, or adjust the command to not embed the literal phrase. |
