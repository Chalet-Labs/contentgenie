# ContentGenie

Podcast discovery, AI-powered summarization, and library management for busy professionals.

ContentGenie helps you find podcasts, get AI-generated episode summaries with key takeaways and "worth it" scores, and manage a personal library of saved episodes and collections.

## Tech Stack

- **Framework:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS, shadcn/ui (Radix primitives)
- **Auth:** Clerk
- **Database:** Neon (serverless Postgres) via Drizzle ORM
- **AI:** OpenRouter API for episode summarization
- **Transcription:** AssemblyAI
- **Podcast Data:** PodcastIndex API
- **Background Jobs:** Trigger.dev
- **Testing:** Vitest, React Testing Library, Storybook

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (package manager and script runner)
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) for secrets management
- Access to the Doppler `contentgenie` project

### Setup

```bash
# Clone the repo
git clone git@github.com:Chalet-Labs/contentgenie.git
cd contentgenie

# Configure secrets
doppler login
doppler setup

# Install dependencies
bun install

# Push database schema (if first time)
bun run db:push

# Start the dev server
bun run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Development

```bash
bun run dev              # Dev server (port 3000, Turbopack)
bun run build            # Production build
bun run lint             # ESLint
bun run test             # Vitest unit tests
bun run test:watch       # Tests in watch mode
bun run test:coverage    # Tests with coverage
bun run storybook        # Storybook (port 6006)
bun run db:generate      # Generate Drizzle migrations
bun run db:push          # Push schema to database
bun run db:studio        # Drizzle Studio (DB browser)
bun run trigger:dev      # Trigger.dev dev server
```

### Secrets

Secrets are managed via [Doppler](https://docs.doppler.com/) -- not `.env` files. All bun scripts that need environment variables are wrapped with `doppler run --`. For one-off commands, use `doppler run -- <command>`.

See [docs/secrets-management.md](docs/secrets-management.md) for full details.

### Pre-commit Hooks

A Husky pre-commit hook runs lint and tests automatically. Both must pass before a commit is accepted.

## Project Structure

```
src/
├── app/
│   ├── actions/          # Server actions (data mutations)
│   ├── api/              # API routes (external service proxies)
│   ├── (app)/            # Authenticated routes (dashboard, library, etc.)
│   └── (auth)/           # Auth routes (sign-in, sign-up)
├── components/
│   ├── ui/               # shadcn/ui primitives
│   ├── dashboard/        # Dashboard components
│   ├── podcasts/         # Podcast/episode cards, search
│   ├── episodes/         # Summary display, ratings
│   └── library/          # Saved episodes, collections
├── db/
│   ├── schema.ts         # Drizzle schema & relations
│   └── index.ts          # Neon connection
├── lib/                  # API clients (OpenRouter, PodcastIndex, AssemblyAI, RSS)
├── trigger/              # Background tasks (episode summarization)
└── middleware.ts          # Clerk auth middleware
```

## Architecture

- **App Router with route groups:** `(auth)` for sign-in/sign-up, `(app)` for authenticated pages with a shared sidebar layout
- **Server actions** handle all data mutations (subscriptions, library, collections)
- **API routes** proxy external services only (PodcastIndex, OpenRouter)
- **Trigger.dev tasks** run durable background jobs (episode transcription + AI summarization)
- **Clerk middleware** protects all routes except the landing page and auth pages

## Contributing

1. Create a branch from `main`
2. Make your changes
3. Run `bun run lint && bun run test && bun run build`
4. Open a PR with a `## Summary` and `## Test plan`

Commit format: `type: Description` (e.g. `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`)

## License

Private -- all rights reserved.
