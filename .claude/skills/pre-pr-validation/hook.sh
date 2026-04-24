#!/usr/bin/env bash
# PreToolUse hook: gate `gh pr create` behind the pre-pr-validation skill.
#
# Contract:
#   exit 0           → allow the tool call through (the default — don't gate)
#   exit 2 + stderr  → block; Claude Code surfaces stderr as the reason
#
# Design stance: fail OPEN on infrastructure problems (missing jq, bad JSON,
# unreadable git state). A broken hook must not wedge the agent's whole
# session — the gate is a guardrail, not a security boundary.

set -uo pipefail

input=$(cat)

# Fast path — 99% of Bash calls have nothing to do with `gh pr create`.
# Cheap substring prefilter avoids forking jq/sed/grep for every innocuous
# command like `ls`, `git status`, or `bun run test`.
case "$input" in
  *'gh pr create'*) ;;
  *) exit 0 ;;
esac

# Only now pay for jq. Fail open if jq is missing or input isn't valid JSON —
# the hook must not brick Bash for users without jq installed.
if ! command -v jq >/dev/null 2>&1; then
  exit 0
fi
command=$(printf '%s' "$input" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0

# Strip quoted substrings so commands that only *mention* `gh pr create`
# (echoes, heredocs, docstrings) don't trip the gate. Then match at
# command-start positions only — line start or after a shell chain operator
# (`;`, `|`, `&`, `(`) — with optional `VAR=val` env prefixes. Known
# limitations (accepted): ANSI-C `$'...'`, here-strings, `eval "..."`,
# escaped quotes inside strings, and `command gh`/`xargs gh` patterns can
# bypass. The gate's adversary is the model forgetting to run the skill,
# not a human bypassing it, so best-effort matching is fine.
naked=$(printf '%s' "$command" | sed -E "s/'[^']*'//g; s/\"[^\"]*\"//g")
if ! printf '%s' "$naked" | grep -qE '(^|[;|&(])[[:space:]]*([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]+[[:space:]]+)*gh[[:space:]]+pr[[:space:]]+create\b'; then
  exit 0
fi

# Gate path. Fail open if git is unreadable (not in a repo, no commits,
# corrupt state). Two rev-parse calls because --abbrev-ref is sticky for
# all refs in a single invocation — can't mix abbrev and SHA in one call.
{ read -r repo_root; read -r head_sha; } < <(git rev-parse --show-toplevel HEAD 2>/dev/null)
[ -z "${repo_root:-}" ] || [ -z "${head_sha:-}" ] && exit 0
branch=$(git -C "$repo_root" rev-parse --abbrev-ref HEAD 2>/dev/null)
[ -z "$branch" ] && exit 0

# Detached HEAD cannot be a PR source — refuse instead of letting a
# `HEAD <sha>` sentinel silently validate.
if [ "$branch" = "HEAD" ]; then
  echo "Refusing to gate \`gh pr create\` from detached HEAD — check out a branch first." >&2
  exit 2
fi

sentinel="$repo_root/.claude/.pr-validated"
expected="$branch $head_sha"
sentinel_content=""
[ -f "$sentinel" ] && sentinel_content=$(tr -d '\n' < "$sentinel" 2>/dev/null || true)

if [ "$sentinel_content" = "$expected" ]; then
  exit 0
fi

cat >&2 <<EOF
Pre-PR validation required before \`gh pr create\`.

Invoke the \`pre-pr-validation\` skill — it runs the full pipeline (rebase,
verify, multi-tool review, fixes, re-verify, push, sentinel) and unblocks
this hook on completion. See .claude/skills/pre-pr-validation/SKILL.md.

  branch:    $branch
  HEAD SHA:  $head_sha
  sentinel:  ${sentinel_content:-missing}
EOF
exit 2
