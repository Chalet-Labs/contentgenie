# ContentGenie

Podcast discovery, AI-powered summarization, and library management for busy professionals. Stack: Next.js 14 App Router, TypeScript, Tailwind/shadcn-ui, Clerk, Neon + Drizzle, OpenRouter, PodcastIndex, Trigger.dev.

## Workflow

- Before planning any work, always pull the latest `main` (`git fetch origin && git merge origin/main` or equivalent).
- Before editing any code, always create a new branch from an up-to-date `main`.
- Single remote: `origin` = `Chalet-Labs/contentgenie`.
- Push feature branches to `origin` and open PRs against `origin/main`.

## Dev environment tips

- Run `doppler setup` once after cloning to configure secrets injection. After that, `bun run dev` just works (scripts already wrap `doppler run --`).
- Use `doppler run -- <command>` if you need to run a one-off command that needs env vars outside of the bun scripts.
- The `@/*` path alias maps to `./src/*` — use it for all imports.
- shadcn/ui components live in `src/components/ui/`. Add new ones with `bunx shadcn@latest add <component>`.
- Server components are the default. Only add `"use client"` when you need browser APIs, hooks, or event handlers.
- Server actions use `"use server"` and live in `src/app/actions/`. They handle all data mutations.
- API routes in `src/app/api/` are for proxying external services and orchestrating Trigger.dev background tasks.

## Development commands

```bash
bun run dev            # Start dev server (port 3000, Turbopack)
bun run build          # Production build
bun run lint           # ESLint (next lint)
bun run test           # Run Vitest unit tests
bun run test:watch     # Run tests in watch mode
bun run test:coverage  # Run tests with coverage (80% threshold on src/lib/)
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
- **Component stories:** Storybook 8 (`@storybook/react-vite`). Config: `.storybook/main.ts`.
- Always run `bun run lint`, `bun run test`, and `bun run build` before committing.
- Unit tests live in `__tests__/` directories co-located with source. Stories live alongside components as `*.stories.tsx` files.
- The pre-commit hook (Husky) automatically runs lint and tests on commit.
- ADRs live in `docs/adr/` — read the relevant ADR before modifying areas it covers.

## PR and commit instructions

- Commit message format: `type: Description` (e.g. `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- Keep commit messages concise (1-2 sentences) focused on the "why".
- PR title: same format as commits, under 70 characters. PR body: `## Summary` bullets + `## Test plan` checklist.
- Always run lint and build before pushing. The CI must pass.
- Update `CHANGELOG.md` under the `[Unreleased]` section when adding features, fixing bugs, or making breaking changes. Use the appropriate subsection: `Added`, `Changed`, `Fixed`, or `Removed`.

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