---
name: pre-pr-validation
description: Use before any `gh pr create` — invoke this skill as soon as the user asks to open, create, submit, or file a pull request, without waiting for the hook to bounce the command. Runs the full pre-PR pipeline: sync with main, verification gate (lint/test/build), parallel multi-tool review (`/codex:review`, `/pr-review-toolkit:review-pr all`, `/simplify`), validates every finding, fixes all valid ones, re-verifies, pushes, writes the sentinel that unblocks PR creation. A PreToolUse hook blocks `gh pr create` until this skill has run and written a fresh sentinel, so triggering it proactively whenever PRs are mentioned is the path of least friction.
---

# Pre-PR Validation

## How this is enforced

A PreToolUse hook blocks `gh pr create` until `.claude/.pr-validated` contains the current branch + HEAD SHA. The sentinel invalidates on every new commit, so if you commit anything after running the skill, run it again before attempting the PR.

You should invoke this skill proactively the moment a PR is discussed — don't wait for the hook to reject `gh pr create`. The hook is a safety net, not a substitute for doing the work.

## Context hygiene — decide how to run this

Before starting the pipeline, decide: **run inline in this session, or dispatch to a fresh Task subagent?**

Skills run inline in the calling agent's context. Sub-commands (`/codex:review`, `/pr-review-toolkit:review-pr`, `/simplify`) delegate their heavy thinking to fresh contexts, but the skill's orchestration — Phase 3 (triage), Phase 4 (apply fixes), Phase 0/5/6 (git ops and verification) — runs wherever you invoked it. If the caller has been doing feature work (lots of file reads, debugging conversations, long planning threads), that cluttered context will hurt triage quality and risks hitting limits mid-pipeline.

**Rule of thumb:**

- **Inline** is fine if the session is fresh — you just started, or you're coming off light work (docs, a small fix, a config change).
- **Dispatch** otherwise. Reviewers are meant to judge the diff on its merits, not on the story of how it got written; losing the conversational context is a feature, not a bug.

When in doubt, dispatch.

### How to dispatch

Launch a `Task` subagent with this brief. The subagent has the same skill registry, so it re-invokes this skill in its own fresh context and drives the pipeline end-to-end:

```
Task({
  subagent_type: "general-purpose",
  description: "Pre-PR validation pipeline",
  prompt: `Run the full pre-PR validation pipeline for this branch.

Working directory: <absolute path to repo>
Branch: <current branch name>
Base branch: origin/main

Invoke the \`pre-pr-validation\` skill and execute every phase (0 through 8) in order. Phase 2 calls \`/codex:review --base main --background\`, \`/pr-review-toolkit:review-pr all\`, and \`/simplify\` in parallel. Validate every finding against the cited code, fix all valid ones, re-verify, push, write the sentinel, then create the PR with the project's standard template (Summary + Test plan).

Stop and surface to the caller only if:
- Phase 0 rebase conflicts are non-trivial
- Reviewers disagree and project conventions don't resolve it
- Phase 5 fails after 2 retry rounds
- \`/codex:status\` is stuck > 15 minutes

Report back one paragraph: phases completed, findings count (valid vs invalid), commits made, push result, PR URL (or the reason no PR was created). Don't dump full review output — the PR body captures what matters.`
})
```

Wait for the subagent's completion message, then relay the PR URL to the user. If the subagent stopped mid-pipeline, read its report and handle the escalation yourself.

## Core principle

Borrowed from `superpowers:verification-before-completion`:

> NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

The sentinel is a completion claim. Don't write it until Phase 5 has produced green evidence *in this session, this turn, with these commands* and Phase 6 has pushed the branch. Previous runs don't count.

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
bun run lint
bun run test
bun run build
```

All three must exit 0. If any fail, fix the root cause (not a suppression, not a workaround) and re-run the failing command. Don't enter Phase 2 with a red build — reviewers waste cycles on broken code.

### Phase 2 — Multi-Tool Review

Launch three reviews in parallel (one message, three independent tool calls):

1. `/codex:review --base main --background` — external perspective. Detaches; poll `/codex:status` until it reports complete before reading output. If status is stuck for more than 15 minutes, run `/codex:cancel` and surface to the user.
2. `/pr-review-toolkit:review-pr all` — specialized agents: code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer, comment-analyzer, code-simplifier.
3. `/simplify` — reuse/quality/efficiency pass.

Wait for all three to complete before proceeding. Collect their full output.

### Phase 3 — Collect & Validate Findings

For every finding from every tool:

1. **Verify the claim.** Read the cited file and line. Does the problem actually exist as described? Reject hallucinations, stale line numbers, and refs to code that no longer exists.
2. **Check for conflicts.** If two tools propose opposite changes, apply project conventions (AGENTS.md, CLAUDE.md, user memory) to pick one. Record the decision in the finding.
3. **Mark valid or invalid.** A finding is valid if the claim is technically correct on the current code. Severity (critical/important/suggestion) does *not* affect validity — all valid findings get fixed.

Don't skip a finding because it seems minor. Agent labor is cheap; accept all valid recommendations. This policy is explicit and overrides default "triage" instincts.

### Phase 4 — Apply Fixes

Implement every valid finding. Group related fixes into logical commits following the project commit convention:

```
type: Description
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`.

Per user memory, commit messages should not mention Claude, AI, or automated generation — focus on the technical change and business value.

### Phase 5 — Re-Verify

Re-run Phase 1 commands fresh:

```bash
bun run lint
bun run test
bun run build
```

All three must exit 0.

If a fix introduced a regression, loop back to Phase 3 for the regressing finding (was it valid? is the fix correct?). Cap retries at 2. If still failing after 2 retries, stop and surface to the user with the specific failure — don't write the sentinel.

### Phase 6 — Push the Branch

Push to `origin`. `gh pr create` needs the branch available on the remote, and the sentinel should reflect a state that exists both locally and remotely.

```bash
git push -u origin HEAD
```

If the push is rejected (non-fast-forward), rebase onto the current `origin/<branch>` and re-run Phase 5 before retrying. Don't force-push without cause.

### Phase 7 — Write Sentinel

Once Phase 5 is green and Phase 6 has pushed, write the sentinel to `.claude/.pr-validated`:

```bash
branch=$(git rev-parse --abbrev-ref HEAD)
sha=$(git rev-parse HEAD)
printf '%s %s\n' "$branch" "$sha" > .claude/.pr-validated
```

The hook compares this against the live state on the next `gh pr create` attempt. `.claude/*` is gitignored, so the sentinel stays local.

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
- Background codex reviews need polling. Don't enter Phase 3 until `/codex:status` confirms completion.
- An unpushed branch never gets a sentinel. Phase 6 is not optional.

## Failure modes

| Symptom | Action |
|---------|--------|
| Phase 0 rebase conflicts | If trivial, resolve and continue. If not, stop and surface to the user. |
| Phase 1 lint/test/build fails | Fix root cause, re-run. Don't proceed. |
| `/codex:status` stuck > 15 min | `/codex:cancel`, surface to user. |
| Reviewers disagree | Apply project conventions; document the choice in the finding. |
| Phase 5 fails after fixes | Retry up to 2×. Then surface with the specific failure. |
| Phase 6 push rejected (non-fast-forward) | Rebase onto current `origin/<branch>`, re-run Phase 5, retry push. No default force-push. |
| `/simplify` unavailable | Log it, continue with codex + pr-review-toolkit. Not fatal. |
