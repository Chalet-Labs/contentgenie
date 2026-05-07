# ADR-053: Topic Detail Realtime Bootstrap — Server-Render Token Bundling

**Status:** Accepted
**Date:** 2026-05-07
**Issue:** [#399](https://github.com/Chalet-Labs/contentgenie/issues/399)

## Context

The new topic detail page (`/topic/[id]`) is the first surface in the codebase
where the **server-component render itself** initiates a Trigger.dev run rather
than reacting to a button click. When a user lands on a topic that has enough
completed episode summaries (`completedSummaryCount >= MIN_DERIVED_COUNT_FOR_DIGEST`)
but no persisted `canonical_topic_digests` row, we want the digest synthesis
to start immediately — before any client interaction — and the panel to begin
streaming progress as soon as it mounts.

Two existing patterns are nearby but neither fits exactly:

- **ADR-029 (Run-ID Persistence for Realtime Reconnection):** documents how a
  client component remounts and re-subscribes to a previously-started run by
  reading the persisted `runId` from the DB. That is **reconnection** to a
  run kicked off by a prior user action.
- **`getRunReconnectionData` (admin.ts):** another reconnection helper —
  client calls it after mount to swap an expired token for a fresh one.

What we need is **first-render bootstrap**: kick off the run inside the same
server pass that renders the page, hand the client both the `runId` and a
freshly-minted `publicAccessToken`, and let `useRealtimeRun` subscribe with
zero round-trips after hydration.

## Options Considered

### Option A: Render only, no auto-trigger

Render the digest panel with an empty/loading state and a "Generate digest"
button. Synthesis starts only when the user clicks.

- **Pro:** Simplest. No server-side side effect during render. No token
  generation cost on every page view of an eligible topic.
- **Con:** Strictly worse user experience — the user sees an empty panel and
  must take action to populate the page they navigated to. ADR-051's
  staleness gate already guards against thundering herd, so the rationale
  for waiting is purely cost-avoidance, but the cost (one Trigger.dev call
  with a 10m idempotency key) is negligible.

### Option B: Client-side `useEffect` kickoff after mount

Render the page; on mount, call `triggerTopicDigestRefresh` from a client
effect, then subscribe to the returned run.

- **Pro:** No server-side side effect during the SC render. Keeps render pure.
- **Con:** Visible flash of "no digest" → "loading" → "loaded". Two extra
  round-trips after hydration (action call, then realtime subscribe).
  Doubles the perceived latency for a state we already know we want.

### Option C: Server-side kickoff during render with token bundled (chosen)

Inside the page server component, after `getTopicDetailData` returns and the
gate condition holds, `await triggerTopicDigestRefresh`. The action calls
`triggerTopicDigestGeneration` (the existing ADR-051 gate) and on `'queued'`
also calls `auth.createPublicToken` to produce a 15-minute scoped token.
Both `runId` and `publicAccessToken` are forwarded as initial props to the
client `<TopicDigestPanel>`, which mounts directly into a loading state and
subscribes via `useRealtimeRun` on its first render — no client-side
discovery roundtrip.

- **Pro:** Zero round-trip from page load to subscription. No flash of empty
  state. The token is bound to a specific `runId`, scoped to read-only on
  that one run, with a TTL chosen to comfortably cover the digest task's
  wall-clock budget (see Decision below).
- **Con:** Couples the server render to a Trigger.dev call. Mitigated by
  ADR-051's idempotency key (`generate-topic-digest-${canonicalTopicId}`,
  10m TTL) which guarantees at most one in-flight run per topic, and by the
  fact that `triggerTopicDigestRefresh` already short-circuits to `'cached'`
  / `'ineligible'` without contacting the SDK in those cases.

## Decision

Adopt **Option C**. Concretely:

1. The page server component evaluates the gate (`digest === null &&
completedSummaryCount >= MIN_DERIVED_COUNT_FOR_DIGEST`) **after**
   `getTopicDetailData` returns.
2. When the gate fires, it `await`s `triggerTopicDigestRefresh`. That
   action delegates to `triggerTopicDigestGeneration` for eligibility /
   staleness, and on `'queued'` adds `auth.createPublicToken` with
   `expirationTime: '15m'` and `scopes: { read: { runs: [runId] } }`.
3. The server passes `initialRunId` + `initialAccessToken` into
   `<TopicDigestPanel>`. The panel's initial state is `loading` when both
   are non-null, so its first paint is the loading affordance, and
   `useRealtimeRun(runId, { accessToken, enabled: true })` subscribes
   immediately.
4. On `run.status === 'COMPLETED'`, the panel calls `router.refresh()`,
   which re-runs the server pass; this time `digest !== null` so the gate
   does not fire again and the panel renders the persisted digest.
5. The token is generated **per-render** rather than cached: tokens are
   scoped to a specific `runId`, which is itself ephemeral, so caching
   would buy nothing.

### TTL = 15 minutes

The digest task's `maxDuration` is 120s; including retry envelope, the
realistic wall-clock budget is ~2-3 minutes. 15 minutes matches the
existing summary precedent in `getRunReconnectionData` and gives generous
headroom for browser tab-switching, sleep/wake, or transient network loss
while the run is still in flight.

## Consequences

- The digest panel must accept both `initialRunId` and `initialAccessToken`
  as props alongside `initialDigest`. The panel state machine is
  `idle | loading | ineligible | error` — `loading` is selected at mount
  time when the bootstrap props are present.
- The eligibility gate (`completedSummaryCount >= MIN_DERIVED_COUNT_FOR_DIGEST`)
  lives on the **page**; the action does not gate independently. This is
  intentional: the page can render either `<TopicDigestPanel>` or
  `<TopicEmptyState>` based on the same threshold without round-tripping.
- A page-integration test (`page.test.tsx`) asserts the single-call
  property: when the gate is met and digest is null, `triggerTopicDigestRefresh`
  is invoked exactly once per page render.
- Cost surface: every fresh page load of an eligible topic without a digest
  triggers one Trigger.dev `tasks.trigger` call and one
  `auth.createPublicToken` call. The idempotency key caps total in-flight
  runs to one per topic per 10 minutes; the token call is a lightweight
  signing operation.
- This pattern is reusable. Any future server-rendered page that wants
  "subscribe to a run on first paint" can copy the contract: server action
  returns `{ runId, publicAccessToken }`, client component takes them as
  initial props, mounts subscribed.

## Related ADRs

- **ADR-029** — Run-ID Persistence for Realtime Reconnection (the
  reconnection-after-remount pattern; this ADR covers first-render
  bootstrap, which is distinct).
- **ADR-051** — Topic Digest Two-Tier Gating (the eligibility/staleness
  gate that `triggerTopicDigestRefresh` delegates to without modification).
- **ADR-052** — Topic Digest Failure Handling (defines the degraded-but-not
  -blank failure mode the panel surfaces when a run terminates in `FAILED`/
  `CANCELED`/`TIMED_OUT`/etc.).
