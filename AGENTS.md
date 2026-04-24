# ContentGenie

Podcast discovery, AI-powered summarization, and library management for busy professionals. Stack: Next.js 14 App Router, TypeScript, Tailwind/shadcn-ui, Clerk, Neon + Drizzle, OpenRouter, PodcastIndex, Trigger.dev.

## Workflow

- Before planning any work, always sync with `main` (`git fetch origin main && git rebase origin/main`). This works in worktrees and on feature branches with in-progress work.
- Before editing any code, always create a new branch from an up-to-date `main`.
- Push feature branches to `origin` and open PRs against `main`.
- **Effort estimation.** Weigh refactors by risk, scope clarity, and safety net (TypeScript, tests) — not by file count or imagined human-coordination cost. Cross-file cleanups that touch 10–50 files are routine one-session work; "project-wide churn" is not a valid reason to defer a clean refactor. Use review bandwidth, not labor, as the legitimate ceiling.

## Dev environment tips

- Run `doppler setup` once after cloning to configure secrets injection. After that, `bun run dev` just works (scripts already wrap `doppler run --`).
- Run `bun install` to install dependencies during first-time setup.
- Use `doppler run -- <command>` if you need to run a one-off command that needs env vars outside of the bun scripts.
- The `@/*` path alias maps to `./src/*` — use it for all imports.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `bunx shadcn@latest add <component>`.
- Server components are the default. Only add `"use client"` when you need browser APIs, hooks, or event handlers.
- Server actions use `"use server"` and live in `src/app/actions/`. They handle all data mutations.
- API routes in `src/app/api/` are for proxying external services and orchestrating Trigger.dev background tasks.

## Architecture map

| Path                          | Purpose                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                    | Next.js App Router pages, route groups `(app)` and `(auth)`                                                                                                               |
| `src/app/actions/`            | Server actions — all mutations (`"use server"`)                                                                                                                           |
| `src/app/api/`                | Route handlers for external API proxying & Trigger.dev orchestration                                                                                                      |
| `src/components/`             | Shared React components (feature + UI)                                                                                                                                    |
| `src/components/ui/`          | shadcn/ui primitives (do not edit by hand)                                                                                                                                |
| `src/lib/`                    | Shared domain logic                                                                                                                                                       |
| `src/db/`                     | Drizzle schema and client — the database schema is defined in `@/db/schema.ts`. Reference it anytime you need to understand the structure of data stored in the database. |
| `src/trigger/`                | Trigger.dev task definitions (background jobs)                                                                                                                            |
| `src/hooks/`, `src/contexts/` | Client-side React hooks and context providers                                                                                                                             |
| `src/types/`                  | Shared TypeScript types and type helpers                                                                                                                                  |
| `src/test/`                   | Test setup (`src/test/setup.ts`) and global fixtures                                                                                                                      |
| `src/middleware.ts`           | Next.js middleware (request-time auth/session)                                                                                                                            |
| `docs/adr/`                   | 30+ ADRs — grep by topic before modifying related code                                                                                                                    |

Coverage: Vitest enforces an 80% line-coverage threshold globally across `src/app/api/`, `src/app/actions/`, `src/components/` (excluding `ui/`), `src/lib/`, and `src/trigger/`. See `vitest.config.ts` for the exact include/exclude lists.

## Development commands

```bash
bun run dev            # Start dev server (port 3000, Turbopack)
bun run build          # Production build
bun run start          # Serve the production build locally (run `bun run build` first)
bun run lint           # ESLint (next lint)
bun run format         # Format all source files with Prettier
bun run format:check   # Verify formatting without writing (used by pre-commit hook)
bun run test           # Run Vitest unit tests
bun run test:watch     # Run tests in watch mode
bun run test:coverage  # Run tests with coverage (80% line threshold, see vitest.config.ts)
bun run storybook      # Launch Storybook dev server (port 6006)
bun run build-storybook # Build static Storybook
bun run db:generate    # Generate Drizzle migrations
bun run db:push        # Push schema to database
bun run db:studio      # Open Drizzle Studio (DB browser)
bun run trigger:dev    # Start Trigger.dev dev server
bun run trigger:deploy # Deploy tasks to Trigger.dev Cloud
```

## Testing instructions

- **Test framework:** Vitest with React Testing Library. Config: `vitest.config.ts`, setup: `src/test/setup.ts`.
- **Component stories:** Storybook 10 (`@storybook/nextjs-vite`). Config: `.storybook/main.ts`.
- Always run `bun run format:check`, `bun run lint`, `bun run test`, and `bun run build` before committing.
- Unit tests live in `__tests__/` directories co-located with source. Stories live alongside components as `*.stories.tsx` files.
- The pre-commit hook (Husky) automatically runs format:check, lint, and tests on commit.
- ADRs live in `docs/adr/` — read the relevant ADR before modifying areas it covers.
- **UI verification (agents):** Vitest/RTL runs in jsdom and can't catch real rendering, layout, or interaction bugs. For any UI work, **invoke the `agent-browser` skill** to test the web app in a real browser:
  - **App flows / pages:** start `bun run dev` (port 3000), then use `agent-browser` to navigate to `http://localhost:3000`, click through the flow, fill forms, and take screenshots.
  - **Isolated components:** start `bun run storybook` (port 6006), then use `agent-browser` to open `http://localhost:6006`, navigate to the relevant story, and screenshot it.
  - Exercise the golden path **and** edge cases; attach screenshots when reporting status. If you can't run a browser check, say so explicitly — don't claim UI success from type-checks alone.

## PR and commit instructions

- Commit message format: `type: Description` (e.g. `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- Keep commit messages concise (1-2 sentences) focused on the "why".
- PR title: same format as commits, under 70 characters. PR body: `## Summary` bullets + `## Test plan` checklist.
- Always run lint and build before pushing. The CI must pass.
- Update `CHANGELOG.md` under the `[Unreleased]` section when adding features, fixing bugs, or making breaking changes. Use the appropriate subsection: `Added`, `Changed`, `Fixed`, or `Removed`.
- See [docs/code-review-checklist.md](docs/code-review-checklist.md) for the review checklist applied before pushing.

## Design

See [.impeccable.md](.impeccable.md) for design context: users, brand personality, aesthetic direction, design principles, and accessibility targets.

## Code style

- TypeScript strict mode; functional React components (no classes).
- `"use client"` only when required; `"use server"` for all server actions.
- `@/` path alias for all imports — never use relative `./` or `../`.
- Tailwind for all styling (no CSS modules).

## Environment & secrets

Secrets are managed via **Doppler** (not `.env` files). Run `doppler setup` after cloning.

See [docs/secrets-management.md](docs/secrets-management.md) for the full variable reference and per-environment setup. Key points:

- `NEXT_PUBLIC_*` variables are inlined at build time — rebuild after changing them in Doppler.
- Vercel environments sync from Doppler automatically; Trigger.dev Prod secrets are set manually.

## Security

- All non-public routes protected by Clerk middleware.
- No `.env` files committed — Doppler handles secrets injection.
- Server actions validate `auth()` before mutations. API routes verify authentication before processing.
