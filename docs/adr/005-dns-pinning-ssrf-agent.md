# ADR-005: DNS-Pinning Fetch to Eliminate TOCTOU in SSRF Protection

**Status:** Accepted
**Date:** 2026-02-15
**Issue:** [#80](https://github.com/Chalet-Labs/contentgenie/issues/80), [#108](https://github.com/Chalet-Labs/contentgenie/issues/108) (confirmed TOCTOU mitigation is effective)

## Context

PR #77 introduced SSRF protection via `isSafeUrl()` (DNS resolution + private IP check) and `safeFetch()` (redirect-following wrapper that validates each hop). However, `safeFetch` has a time-of-check-to-time-of-use (TOCTOU) vulnerability:

1. `isSafeUrl()` resolves DNS and validates all returned IPs are public.
2. `fetch()` (Node.js built-in, powered by undici) performs its own independent DNS resolution.

Between steps 1 and 2, an attacker controlling DNS can rebind the hostname from a public IP to a private IP (e.g., `169.254.169.254` for cloud metadata). This is the classic DNS rebinding attack.

The current `rss.ts` module already uses the recommended fetch-then-parse pattern (`safeFetch` returns XML, `parser.parseString()` parses it), so `rss-parser` itself never makes network requests. The vulnerability is isolated to the DNS gap within `safeFetch`.

**Note on the issue's implementation guide:** Issue #80's "Implementation Guide" suggests modifying `rss.ts` to pass custom agents to rss-parser via `requestOptions.agent`. This approach is obsolete — PR #77 already refactored `parsePodcastFeed()` to the fetch-then-parse pattern (the issue's own "Alternative approach (recommended)"). `rss.ts` calls `safeFetch(feedUrl)` to get XML, then `parser.parseString(xmlContent)` to parse it locally. No `rss.ts` changes are needed; the fix is entirely within `safeFetch`'s use of `fetch()`.

## Options Considered

### Option A: Custom undici Agent with `connect.lookup` override

Override the DNS lookup function in undici's connect options to resolve DNS ourselves, validate IPs, and pin the resolved IP for the TCP connection.

- **Pro:** Single DNS resolution per connection. The validated IP is used directly for the TCP handshake — no TOCTOU gap. Works with Node.js built-in `fetch` via the `dispatcher` option.
- **Con:** Relies on undici's `connect.lookup` option, which is a semi-internal API. Requires importing `undici.Agent` (bundled with Node.js 18+ but needs explicit import).

### Option B: DNS-pinning fetch wrapper (resolve, validate, fetch with IP + Host header)

Resolve DNS ourselves, validate IPs, then fetch using the resolved IP directly (e.g., `https://93.184.216.34/feed.xml`) with a `Host` header set to the original hostname.

- **Pro:** No dependency on undici internals. Completely eliminates TOCTOU.
- **Con:** Breaks TLS certificate validation — the certificate is issued for the hostname, not the IP. Requires disabling TLS verification or using a custom TLS `servername` option, which is not available through the `fetch` API. Only viable for HTTP, not HTTPS.

### Option C: Custom `http.Agent`/`https.Agent` with `createConnection` override (chosen)

Create Node.js `http.Agent` and `https.Agent` subclasses that override `createConnection` to:
1. Resolve DNS for the target hostname.
2. Validate all resolved IPs against `isPrivateIP()`.
3. If all IPs are safe, connect directly to a validated IP.
4. If any IP is private, throw before the TCP connection is established.

The custom agents are passed to `safeFetch` which uses `node-fetch` (or a thin wrapper) instead of the built-in `fetch`, since the built-in `fetch` (undici) does not support Node.js `http.Agent`.

**Alternative sub-option (chosen):** Rather than switching to `node-fetch`, use undici's `Agent` with a `connect.lookup` callback that performs DNS resolution and IP validation. This keeps us on the built-in `fetch` and avoids adding a new HTTP client dependency.

- **Pro:** Single DNS resolution that is both validated and used for the connection. No new HTTP client dependency. Works with `fetch(..., { dispatcher: agent })`. The `connect.lookup` callback has the same signature as `dns.lookup`, making it a clean integration point.
- **Con:** Requires `import { Agent } from 'undici'` (bundled with Node.js but technically a separate module). The `connect.lookup` API is stable in undici but not documented in Node.js core docs.

### Option D: Abort-on-connect validation (socket inspection)

Let `fetch` resolve DNS and connect normally, but inspect the socket's remote address immediately after connection and abort if it's private.

- **Pro:** No custom DNS resolution. Works with any HTTP client.
- **Con:** The TCP connection to the private IP is already established before we can abort — data may have been sent/received. This is a mitigation, not a fix. Some cloud metadata services respond to the initial TCP SYN with data.

## Decision

**Option C (undici Agent sub-option):** Create a DNS-pinning undici `Agent` with a custom `connect.lookup` that resolves DNS, validates all IPs against `isPrivateIP()`, and provides the validated IP to undici for the TCP connection.

## Rationale

- **Eliminates the TOCTOU gap.** DNS is resolved exactly once, validated, and the same resolved IP is used for the connection. There is no window for rebinding.
- **No new dependencies.** `undici` is bundled with Node.js 18+ and already powers the built-in `fetch`. Importing `Agent` from `undici` does not add a new package.
- **Minimal API surface change.** `safeFetch` continues to use `fetch()` with the addition of a `dispatcher` option. The function signature and return type are unchanged. All existing callers (`rss.ts`, etc.) are unaffected.
- **Composable with existing redirect protection.** `safeFetch` already validates each redirect hop via `isSafeUrl()`. With DNS pinning, `isSafeUrl()` becomes a redundant pre-check — but we keep it as defense-in-depth. The agent provides the connection-level guarantee; `isSafeUrl()` provides the application-level early rejection (avoiding the overhead of a TCP connection attempt to obviously-bad URLs).
- **TLS works correctly.** Unlike Option B, undici's `connect.lookup` resolves the IP for the TCP connection while preserving the original hostname for TLS SNI and certificate validation.

## Implementation

1. **New module: `src/lib/dns-pinning-agent.ts`**
   - Exports `createDnsPinningAgent()` — creates an undici `Agent` with a custom `connect.lookup` callback.
   - The callback uses `dns.lookup()` with `{ all: true }` to resolve all IPs, validates each against `isPrivateIP()`, and rejects the connection if ANY resolved IP is private (per issue #80: "If any resolved IP is private, reject all -- do not try the next IP"). Returns the first IP only if all are public.
   - The agent is created once (module-level singleton) and reused across requests.
   - The agent is configured with `connect: { timeout: 30_000 }` (30-second connection timeout) and `bodyTimeout: 60_000` / `headersTimeout: 60_000` (60-second response timeouts). **Note:** There is no pre-existing timeout in `safeFetch` or `rss.ts` — the issue's "60s timeout" refers to a desired maximum, not an existing configuration. The agent introduces explicit timeouts where none existed before, which is strictly an improvement.

2. **Update `safeFetch` in `src/lib/security.ts`**
   - Pass `{ dispatcher: dnsPinningAgent }` to each `fetch()` call.
   - Keep the existing `isSafeUrl()` pre-check as defense-in-depth (fast rejection of obviously-bad URLs without establishing a TCP connection).

3. **Tests: `src/lib/__tests__/dns-pinning-agent.test.ts`**
   - Unit tests for the agent's DNS resolution and IP validation behavior.
   - Tests for DNS rebinding scenarios (mock DNS returning private IP).
   - Tests confirming TLS hostname verification is preserved.

4. **Integration tests: `src/lib/__tests__/security.test.ts`**
   - Add integration tests to `safeFetch` to verify the DNS-pinning agent is passed as the dispatcher.

## Consequences

- `undici` becomes an explicit import (previously only used implicitly via built-in `fetch`). This is a dev-time concern only — no new runtime dependency.
- The DNS-pinning agent creates a connection pool. For our use case (low-volume RSS fetching), the default pool settings are fine. If connection volume grows, pool tuning may be needed.
- `isSafeUrl()` remains exported and used by `subscriptions.ts` for early URL validation before attempting a fetch. Its DNS resolution is now redundant with the agent's, but the overhead is negligible and the defense-in-depth is valuable.
- If Node.js changes undici's `connect.lookup` API in a future major version, the agent will need updating. This risk is low — the API has been stable since undici v5 and is widely used for this exact purpose.
