#!/usr/bin/env bash
# PreToolUse hook: gate `gh pr create` behind the pre-pr-validation skill.
# Exits 0 to allow, 2 with stderr to block (Claude Code surfaces stderr as the block reason).

set -euo pipefail

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""')

# Fast path: only gate actual `gh pr create` invocations. Strip single- and
# double-quoted substrings first so commands that merely *mention* the string
# (e.g. `echo "run gh pr create"`, help text) are not caught. Match only at
# command-start positions — line start or after a shell chain operator
# (`;`, `|`, `&`, `(`) — with optional `VAR=val` env prefixes. This rejects
# `echo hello gh pr create world` (bare whitespace) while accepting
# `FOO=bar gh pr create` and `cd dir && gh pr create`.
naked=$(printf '%s' "$command" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
if ! printf '%s' "$naked" | grep -qE '(^|[;|&(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*gh[[:space:]]+pr[[:space:]]+create\b'; then
  exit 0
fi

repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [ -z "$repo_root" ]; then
  # Not in a git repo — nothing to validate against.
  exit 0
fi

sentinel="$repo_root/.claude/.pr-validated"
branch=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD)
head_sha=$(git -C "$repo_root" rev-parse HEAD)
expected="$branch $head_sha"

if [ -f "$sentinel" ] && [ "$(tr -d '\n' < "$sentinel")" = "$expected" ]; then
  exit 0
fi

cat >&2 <<EOF
Pre-PR validation required before \`gh pr create\`.

Invoke the \`pre-pr-validation\` skill now. It runs:
  0. Rebase onto origin/main
  1. Verification gate — bun run build (tsc/lint/test are already enforced per commit by the husky hook)
  2. Parallel review — /codex:review --base main --background, /pr-review-toolkit:review-pr all, /simplify
  3. Validate every finding (reject hallucinations, read cited lines)
  4. Fix all valid findings
  5. Re-verify build
  6. Push branch to origin
  7. Write sentinel to .claude/.pr-validated (\`<branch> <sha>\`)

Only after the skill completes and writes the sentinel will this hook allow \`gh pr create\`.

Current state:
  branch:    $branch
  HEAD SHA:  $head_sha
  sentinel:  $([ -f "$sentinel" ] && echo "stale: $(tr -d '\n' < "$sentinel")" || echo "missing")
EOF
exit 2
