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
| `TRIGGER_SECRET_KEY` | Server | Trigger.dev secret key (background jobs) |
| `ASSEMBLYAI_API_KEY` | Server | AssemblyAI transcription API key |

## Vercel Integration

Doppler syncs secrets to Vercel automatically via the [Doppler Vercel integration](https://docs.doppler.com/docs/vercel):
- Vercel **Development** syncs from Doppler `dev` config
- Vercel **Preview** syncs from Doppler `stg` config
- Vercel **Production** syncs from Doppler `prd` config

The Vercel integration injects env vars directly into the Vercel build environment. Vercel's build command should be set to `next build` (without `doppler run --`) in the Vercel project settings, since Doppler's native integration handles the injection.

## Neon Integration

The [Neon Vercel integration](https://docs.neon.tech/docs/integrations/vercel) manages `DATABASE_URL` for Vercel deployments:

- **Production** deployments use the Neon `main` branch
- **Preview** deployments automatically get an isolated Neon database branch per PR

Because Neon owns `DATABASE_URL` in Vercel, this variable is **not** included in Doppler `stg` or `prd` configs. It is only in Doppler `dev` for local development.

## CI/CD

GitHub Actions runs quality checks (lint, test, Storybook build) on every PR and push to `main`. Vercel handles production and preview builds/deploys separately, so CI does not need Doppler or a `next build` step.

Trigger.dev tasks are auto-deployed via the [Trigger.dev GitHub integration](https://trigger.dev/docs/github-integration) when changes are pushed to `main`.

## Troubleshooting

**"doppler: command not found"**
Install the Doppler CLI following the instructions above.

**"doppler: missing project or config"**
Run `doppler setup` in the project root to link your local environment.

**"Unable to fetch secrets"**
Run `doppler login` to re-authenticate, then `doppler setup` to re-link.

**"NEXT_PUBLIC_* variables not available in browser"**
`NEXT_PUBLIC_*` variables are inlined at build time. If you change them in Doppler, you must rebuild the app (`bun run build`).
