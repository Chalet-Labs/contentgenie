# ADR-008: AI Provider Abstraction Layer

**Status:** Accepted
**Date:** 2026-02-21
**Issue:** [#139](https://github.com/Chalet-Labs/contentgenie/issues/139)

## Context

ContentGenie currently hardcodes OpenRouter as the sole AI provider in `src/lib/openrouter.ts`. The `generateCompletion` function constructs requests with OpenRouter-specific headers (`HTTP-Referer`, `X-Title`) and reads `OPENROUTER_API_KEY` directly from the environment. The trigger helper `src/trigger/helpers/openrouter.ts` calls this function, and the `summarize-episode` task is the primary consumer.

Issue #139 requires supporting multiple AI backends (OpenRouter and Z.AI/GLM) with admin-selectable provider and model configuration stored in the database. This introduces two new concerns:

1. **Provider abstraction:** Both OpenRouter and Z.AI expose OpenAI-compatible chat completion endpoints, but they differ in base URL, authentication headers, and available models. A provider interface is needed to unify these differences.
2. **Admin configuration:** The active provider and model must be stored in the database and readable by both the Next.js app (server actions, API routes) and Trigger.dev tasks (which run on separate infrastructure).

## Options Considered

### Option A: Extend existing `openrouter.ts` with conditional logic

Add `if/else` branches in `generateCompletion` to switch between OpenRouter and Z.AI based on a config parameter.

- **Pro:** Minimal new files. Quick to implement.
- **Con:** Violates open-closed principle. Each new provider adds more conditionals. Provider-specific logic (headers, error handling) becomes interleaved. Hard to test providers in isolation.

### Option B: Strategy pattern with provider interface (chosen)

Define an `AiProvider` interface with a `generateCompletion` method. Each provider implements this interface in its own module. A factory function reads the active config from the database and returns the appropriate provider instance.

- **Pro:** Clean separation of concerns. Each provider is independently testable. Adding a new provider requires only a new module and a registry entry. The interface enforces a consistent contract.
- **Con:** More files and indirection than Option A. Slightly higher initial complexity.

### Option C: External AI gateway (e.g., LiteLLM proxy)

Deploy an AI proxy that handles provider routing, and point ContentGenie at the proxy.

- **Pro:** Decouples provider logic entirely from the application. Supports dozens of providers out of the box.
- **Con:** New infrastructure dependency. Operational overhead (deploy, monitor, scale the proxy). Overkill for two providers. Adds network hop and latency.

## Decision

**Option B: Strategy pattern with provider interface.**

### Key design decisions

1. **`AiProvider` interface.** A TypeScript interface with a single `generateCompletion` method that accepts messages and options, returning a string. Both `OpenRouterProvider` and `ZaiProvider` implement this interface. The interface also includes a `name` property for logging/debugging.

2. **Shared message type.** The existing `OpenRouterMessage` type (with `role` and `content` fields) is renamed to `AiMessage` and moved to the shared types module. Both providers use this type, since both APIs accept OpenAI-compatible message formats.

3. **`ai_config` database table.** A single-row table storing `provider` (enum: `"openrouter"` | `"zai"`), `model` (text), `updated_by` (FK to users), and `updated_at`. The table uses a `serial` primary key but is constrained to a single active row by application logic. A check constraint validates the provider value.

4. **`getActiveAiConfig` function.** Reads the active config from the database. If no row exists, returns the fallback: `{ provider: "openrouter", model: "google/gemini-2.0-flash-001" }`. This is called at the start of each summarization run, ensuring config changes take effect on the next run without redeployment.

5. **`getAiProvider` factory function.** Takes a provider name and returns the corresponding `AiProvider` instance. Providers are stateless — they receive API keys and config at call time, not at construction time. This avoids stale state in long-running Trigger.dev tasks.

6. **Provider-specific concerns:**
   - **OpenRouter:** Base URL `https://openrouter.ai/api/v1/chat/completions`. Requires `HTTP-Referer` and `X-Title` headers. Uses `OPENROUTER_API_KEY`. Standard `finish_reason` values (`stop`, `length`).
   - **Z.AI:** Base URL `https://api.z.ai/api/paas/v4/chat/completions`. No extra headers beyond `Authorization`. Uses `ZAI_API_KEY`. Additional `finish_reason` values include `sensitive` (content filtered) and `network_error` — both should be treated as errors by the provider implementation.

7. **Backward compatibility of `generateCompletion`.** The existing `generateCompletion` export in `src/lib/openrouter.ts` is replaced by a provider-aware version in `src/lib/ai/generate.ts` that reads the active config from the DB. The `parseJsonResponse` and `SummaryResult` types remain in their current location (or are re-exported) to minimize churn in consumers.

8. **Trigger.dev integration.** The `summarize-episode` task calls `getActiveAiConfig()` at the start of `run()`, then passes the config to `generateEpisodeSummary`. This means each run uses the config active at execution time, not at trigger time.

9. **Admin UI.** A new `AiProviderCard` component on the Settings page, visible only to users with the `org:admin` Clerk role. The card contains Provider and Model dropdowns and a Save button. The `useUser()` hook's `has()` method checks the role client-side for conditional rendering. The server action validates the role server-side via `auth().has({ role: "org:admin" })`.

10. **Role-based access control.** Clerk's `auth().has()` API is used in the server action to enforce `org:admin`. This is the first use of organization roles in the codebase. The middleware is not modified — the settings page itself is already protected by the existing auth middleware; the admin card is conditionally rendered within it.

## Consequences

- A new `src/lib/ai/` directory is introduced with provider abstraction, replacing the monolithic `src/lib/openrouter.ts` for completion generation. The old module retains `parseJsonResponse` and `SummaryResult` for backward compatibility.
- A new `ai_config` database table is added. This requires a migration (`db:generate` + `db:push`).
- The `ZAI_API_KEY` secret must be added to Doppler (all environments) and to the Trigger.dev dashboard (Prod).
- Admin role checking via Clerk organizations is introduced. The Clerk dashboard must have the `org:admin` role configured.
- The `summarize-episode` task gains a DB read at the start of each run (~20-50ms overhead, negligible relative to the AI API call).
- Adding future AI providers requires only: (a) a new provider module implementing `AiProvider`, (b) a registry entry in the factory, (c) updating the provider enum in the schema and the admin UI dropdown.
