# Secrets Management with Doppler

ContentGenie uses [Doppler](https://docs.doppler.com/) for centralized secrets management. All environment variables are managed through Doppler rather than `.env` files.

## Prerequisites

Install the Doppler CLI:

```bash
# macOS
brew install dopplerhq/cli/doppler

# Linux (Debian/Ubuntu)
apt-get update && apt-get install -y apt-transport-https ca-certificates curl gnupg
curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | tee /etc/apt/sources.list.d/doppler-cli.list
apt-get update && apt-get install doppler

# Universal install script
curl -Ls --tlsv1.2 --proto "=https" --retry 3 https://cli.doppler.com/install.sh | sh
```

## Getting Started

### 1. Authenticate

```bash
doppler login
```

This opens a browser window for authentication. Follow the prompts to log in.

### 2. Set up the project

```bash
doppler setup
```

The `doppler.yaml` in the repo root pre-configures the project name (`contentgenie`) and default config (`dev`). Running `doppler setup` links your local environment.

### 3. Run the app

```bash
bun run dev
```

Most `package.json` scripts are wrapped with `doppler run --`, which injects environment variables from your configured Doppler environment before running the command. Scripts that don't need secrets (like `lint`) run without Doppler.

## Environments

| Doppler Config | Purpose | Vercel Environment |
|---------------|---------|-------------------|
| `dev` | Local development | Development |
| `stg` | Staging/preview deployments | Preview |
| `prd` | Production | Production |

## Managed Secrets

| Variable | Type | Description |
|----------|------|-------------|
| `DATABASE_URL` | Server | Neon PostgreSQL connection string (Doppler `dev` only; Neon integration handles Vercel) |
| `PODCASTINDEX_API_KEY` | Server | PodcastIndex API key |
| `PODCASTINDEX_API_SECRET` | Server | PodcastIndex API secret |
| `OPENROUTER_API_KEY` | Server | OpenRouter AI API key |
| `NEXT_PUBLIC_APP_URL` | Public | Application URL (inlined at build time) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Public | Clerk publishable key (inlined at build time) |
| `CLERK_SECRET_KEY` | Server | Clerk secret key |
| `CLERK_SIGN_IN_FORCE_REDIRECT_URL` | Server | URL to redirect to after sign-in (e.g. `/dashboard`) |
| `CLERK_SIGN_UP_FORCE_REDIRECT_URL` | Server | URL to redirect to after sign-up (e.g. `/dashboard`) |
| `TRIGGER_SECRET_KEY` | Server | Trigger.dev secret key (background jobs) |
| `ASSEMBLYAI_API_KEY` | Server | AssemblyAI transcription API key |

## Vercel Integration

Doppler syncs secrets to Vercel automatically via the [Doppler Vercel integration](https://docs.doppler.com/docs/vercel):
- Vercel **Development** syncs from Doppler `dev` config
- Vercel **Preview** syncs from Doppler `stg` config
- Vercel **Production** syncs from Doppler `prd` config

The Vercel integration injects env vars directly into the Vercel build environment. Vercel auto-detects the `vercel-build` script in `package.json`, so the dashboard build command should be left unset (or set to `null`). Doppler's native integration handles secrets injection.

## Neon Integration

The [Neon Vercel integration](https://docs.neon.tech/docs/integrations/vercel) manages `DATABASE_URL` for Vercel deployments:

- **Production** deployments use the Neon `main` branch
- **Preview** deployments automatically get an isolated Neon database branch per PR

Because Neon owns `DATABASE_URL` in Vercel, this variable is **not** included in Doppler `stg` or `prd` configs. It is only in Doppler `dev` for local development.

### Preview schema migrations

Preview Neon branches start as copies of the production schema but need any pending schema changes applied. The `vercel-build` script in `package.json` handles this automatically:

```bash
"vercel-build": "if [ \"$VERCEL_ENV\" = \"preview\" ]; then npx drizzle-kit push --force; fi && next build"
```

- For **preview** deployments, `drizzle-kit push --force` runs against the Neon branch's `DATABASE_URL` before `next build`, ensuring the schema is up to date.
- For **production** deployments, the migration step is skipped. Production schema changes are applied manually via `bun run db:push`.
- `drizzle-kit push` is idempotent — safe to run on every build even if the schema hasn't changed.

See [ADR-002](adr/002-preview-database-migrations.md) for the full decision record.

## Trigger.dev Integration

Trigger.dev tasks run on Trigger.dev Cloud infrastructure, not in Vercel. Secrets are managed differently per environment:

- **Dev:** Auto-synced from Doppler via the `syncEnvVars` build extension in `trigger.config.ts`. Requires a `DOPPLER_TOKEN` (read-only service token for Doppler `dev` config) set in the Trigger.dev Dev environment.
- **Prod:** Set **manually** in the [Trigger.dev dashboard](https://cloud.trigger.dev). Do **not** set `DOPPLER_TOKEN` in the Prod environment — this disables auto-sync.

> **Why manual for Prod?** The previous approach synced all environments from Doppler, but the `DOPPLER_TOKEN` mapping was fragile — a wrong token silently pointed all secrets (including `DATABASE_URL`) at the wrong Doppler config, causing Trigger.dev to write to the dev database while Vercel production read from the main database.

### Setup — Dev environment

1. Create a **read-only Service Token** in Doppler for the `dev` config.
2. Add the token as `DOPPLER_TOKEN` in the [Trigger.dev dashboard](https://cloud.trigger.dev) → Environment Variables → **Dev** environment only.
3. On deploy, `syncEnvVars` fetches all secrets from Doppler and injects them into the Trigger.dev Dev runtime.

For **local development**, `bun run trigger:dev` is already wrapped with `doppler run --`, so secrets are injected from your local Doppler `dev` config.

### Setup — Prod environment

Set the following variables **manually** in the [Trigger.dev dashboard](https://cloud.trigger.dev) → Environment Variables → **Prod** environment:

| Variable | Where to find the value |
|----------|------------------------|
| `DATABASE_URL` | Neon Console → main branch → Connection string |
| `PODCASTINDEX_API_KEY` | Doppler `prd` config |
| `PODCASTINDEX_API_SECRET` | Doppler `prd` config |
| `OPENROUTER_API_KEY` | Doppler `prd` config |
| `ASSEMBLYAI_API_KEY` | Doppler `prd` config |

### Updating secrets

- **Dev:** Update in Doppler, then redeploy Trigger.dev (`bun run trigger:deploy` or push to `main`).
- **Prod:** Update in both Doppler (for Vercel) **and** the Trigger.dev dashboard, then redeploy.

## CI/CD

GitHub Actions runs quality checks (lint, test, Storybook build) on every PR and push to `main`. Vercel handles production and preview builds/deploys separately, so CI does not need Doppler or a `next build` step.

Trigger.dev tasks are auto-deployed via the [Trigger.dev GitHub integration](https://trigger.dev/docs/github-integration) when changes are pushed to `main`. Dev secrets are synced from Doppler via `syncEnvVars`; Prod secrets are managed manually in the Trigger.dev dashboard (see [Trigger.dev Integration](#triggerdev-integration) above).

## Troubleshooting

**"doppler: command not found"**
Install the Doppler CLI following the instructions above.

**"doppler: missing project or config"**
Run `doppler setup` in the project root to link your local environment.

**"Unable to fetch secrets"**
Run `doppler login` to re-authenticate, then `doppler setup` to re-link.

**"NEXT_PUBLIC_* variables not available in browser"**
`NEXT_PUBLIC_*` variables are inlined at build time. If you change them in Doppler, you must rebuild the app (`bun run build`).
