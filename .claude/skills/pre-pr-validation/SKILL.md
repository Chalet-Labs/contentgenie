---
name: pre-pr-validation
description: Use before any `gh pr create` — invoke this skill as soon as the user asks to open, create, submit, or file a pull request, without waiting for the hook to bounce the command. Runs the full pre-PR pipeline: rebase onto main, build check (tsc/lint/test are enforced per commit by the husky hook), parallel multi-tool review (Codex review via `codex review --base main`, `/pr-review-toolkit:review-pr all`, `/simplify`), validates every finding, auto-fixes all valid ones without pausing for approval, re-verifies, pushes, writes the sentinel that unblocks PR creation, then opens the PR. A PreToolUse hook guards `gh pr create` until a fresh sentinel exists, so triggering this skill proactively whenever PRs are mentioned is the path of least friction.
---

# Pre-PR Validation

## How this is enforced

A PreToolUse hook guards `gh pr create` until `.claude/.pr-validated` contains the current branch + HEAD SHA. The sentinel invalidates on any HEAD change (new commit, amend, rebase, branch rename/switch), so any commit made after running the skill forces a re-run before the PR.

The hook is a best-effort guardrail — not a security boundary. A sufficiently crafted invocation (backticks, `eval`, `command gh`, aliases) can bypass it. Its job is to stop the model from forgetting to run the skill, not to stop a human who has already decided to skip validation.

You should invoke this skill proactively the moment a PR is discussed — don't wait for the hook to reject `gh pr create`.

## Run inline — do not dispatch to a subagent

Run this pipeline inline in the calling session. Don't wrap it in a `Task` subagent.

The sub-tools this skill invokes (`/codex:review`, `/pr-review-toolkit:review-pr`, `/simplify`) already isolate their heavy review work in their own freshly-spawned subagents — each reviewer (code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, comment-analyzer, code-simplifier) gets a clean context. Context hygiene is handled there, not here. Wrapping the whole pipeline in an outer subagent adds a layer that can't dispatch further Task/Agent calls (subagents can't spawn subagents), which breaks the Codex-review path (Phase 2a requires `Task({run_in_background: true})`) and may also affect Skill availability for the other two reviewers. Net result: weaker review coverage, no context win.

If the caller's context is cluttered, the cost is mildly worse triage in Phase 3 — not broken reviews. That trade-off goes in favour of running inline.

## Core principle

Borrowed from `superpowers:verification-before-completion`:

> NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

The sentinel is a completion claim. Don't write it until Phase 5 has produced green evidence *in this session, this turn, with these commands* and Phase 6 has pushed the branch. Previous runs don't count.

## Unattended execution policy (read before Phase 3)

After Phase 2 returns findings, **do not stop to ask the user for approval before fixing them.** Validate each finding (Phase 3), then apply every valid fix (Phase 4) in one continuous run. The user has already opted into this policy by invoking the skill — pausing to triage defeats the point.

Exceptions (the only times you stop):
- A finding requires judgement the skill can't make (e.g., "rename this product concept" — ask).
- Two reviewers propose opposite changes and project conventions don't resolve it.
- The fix would touch code outside the PR's stated scope in a way that surprises the caller.

"This feels like a lot of changes" is not an exception. Agent labor is cheap; the reviewers were called because their recommendations are worth applying.

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

**Why only build?** Husky's pre-commit runs `tsc --noEmit`, `bun run lint`, and `bun run test` on every *new* commit, so in the common case the only remaining gap is `bun run build` (Next.js page-export restrictions surface only here). However, `git rebase` reapplies commits **without** firing pre-commit — same for any prior `--no-verify` / `HUSKY=0` commits. If Phase 0 rewrote history (compare `git rev-parse HEAD` before and after, or just check `HEAD@{1}` ≠ `HEAD`), run `bun run lint` and `bun run test` here before the build.

### Phase 2 — Multi-Tool Review

Launch three reviews in parallel (one message, three independent tool calls):

1. **Codex review** — dispatch a `Task` subagent with `run_in_background: true` to run `codex review --base main` via Bash. The background flag lets the orchestrator proceed without waiting; you'll be notified on completion.

   ```
   Task({
     subagent_type: "general-purpose",
     description: "Codex review vs main",
     run_in_background: true,
     prompt: `Run \`codex review --base main\` from <absolute repo path> via Bash. Return findings as file:line, issue, suggested fix. If the CLI errors (auth, network, missing binary), report the failure verbatim.`
   })
   ```

2. `/pr-review-toolkit:review-pr all` — code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, comment-analyzer, code-simplifier.
3. `/simplify` — reuse/quality/efficiency pass.

Launch all three in the same message. Don't enter Phase 3 until the Codex task callback arrives and both Skill calls have returned. Don't run `codex:setup` — it's one-time init, not part of the pipeline.

### Phase 3 — Collect & Validate Findings

For every finding from every tool:

1. **Verify the claim.** Read the cited file and line. Does the problem actually exist as described? Reject hallucinations, stale line numbers, and refs to code that no longer exists.
2. **Check for conflicts.** If two tools propose opposite changes, apply project conventions (AGENTS.md, CLAUDE.md, user memory) to pick one. Record the decision in the finding.
3. **Mark valid or invalid.** A finding is valid if the claim is technically correct on the current code. Severity (critical/important/suggestion) does *not* affect validity — all valid findings get fixed.

Don't skip a finding because it seems minor. Per the unattended execution policy above, every valid finding goes straight to Phase 4 without an approval pause.

### Phase 4 — Apply Fixes

Implement every valid finding. Group related fixes into logical commits following the project commit convention:

```
type: Description
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`.

Per user memory, commit messages should not mention Claude, AI, or automated generation — focus on the technical change and business value.

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

The hook compares this against the live state on the next `gh pr create` attempt. `.claude/.pr-validated` is not in the `.gitignore` whitelist, so it stays local (the committed entries are `settings.json`, `mcp.json`, `skills/`).

Write it last — it's the final filesystem mutation before PR creation. Any commit made after this point changes HEAD and invalidates the sentinel, and the hook re-blocks. The skill's own fix-commits (Phase 4) happen before Phase 7, so they never cause a retrigger.

### Phase 8 — Create the PR

Now `gh pr create` is allowed. Use the project's standard PR template:

```
## Summary
- bullets

## Test plan
- [ ] checklist items
```

Title: `type: Description`, under 70 characters, same convention as commits. Use `--repo Chalet-Labs/contentgenie` per user memory.

## Critical rules

- Sentinel timing matters: write it last, after Phase 5 is green and Phase 6 has pushed. Any commit afterwards invalidates it.
- Own commits don't retrigger. Phase 4 fix-commits run before Phase 7 writes the sentinel, so the sentinel records the post-fix HEAD. Safe.
- No partial verification. "Tests looked fine earlier" is not evidence. Re-run in this session.
- No skipping the review phase, even for docs-only changes. The hook doesn't know what's in the diff.
- Do not run `codex:setup` — it's one-time init, not part of the pipeline.
- An unpushed branch never gets a sentinel. Phase 6 is not optional.
- Unattended means unattended. Phase 3 → Phase 4 runs without an approval pause.

## Failure modes

| Symptom | Action |
|---------|--------|
| Phase 0 rebase conflicts | If trivial, resolve and continue. If not, stop and surface to the user. |
| Phase 1 build fails | Fix root cause, re-run. Don't proceed. |
| Codex `Task` subagent stuck > 15 min | Abandon the background task, proceed with the remaining reviewers, and surface to user. |
| Reviewers disagree | Apply project conventions; document the choice in the finding. |
| Phase 5 fails after fixes | Retry up to 2×. Then surface with the specific failure. |
| Phase 6 push rejected (non-fast-forward) | Rebase onto current `origin/<branch>`, re-run Phase 5, retry push. No default force-push. |
| `/simplify` or `/pr-review-toolkit:review-pr` unavailable | Log it, continue with the remaining reviewers. Not fatal. |
| Hook fires on a legitimate command mentioning `gh pr create` | Known limitation — the regex is best-effort. Work around by invoking the real `gh pr create` after the skill completes normally, or adjust the command to not embed the literal phrase. |
