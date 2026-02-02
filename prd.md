# ContentGenie - Product Requirements Document

## Overview
ContentGenie is a productivity tool for busy professionals who want to stay informed without spending hours consuming full podcast episodes. The platform automatically transcribes and summarizes podcast content, helps users discover new podcasts, and provides intelligent ratings to help users decide what's worth their time.

## Target Audience
**Primary Users:** Busy professionals who:
- Want to stay up-to-date with industry podcasts but lack time
- Need quick summaries to decide if an episode is worth a full listen
- Want to organize and save valuable content for future reference
- Value efficiency and curated, quality content

**Pain Points Addressed:**
- Too many podcasts, not enough time
- Difficulty finding relevant episodes across multiple shows
- No way to quickly assess if content is valuable before committing time
- Scattered notes and bookmarks across different platforms

## Core Features

### 1. AI-Powered Summaries (Priority: High)
- Automatic transcription of podcast episodes via PodcastIndex
- AI-generated summaries using OpenRouter (Gemini Flash)
- Key takeaways and highlights extraction
- Time-stamped notable moments

### 2. Podcast Discovery (Priority: High)
- Search podcasts and episodes via PodcastIndex API
- Subscribe to podcasts to track new episodes
- Category and topic-based browsing
- Trending and recommended content

### 3. Personal Library (Priority: High)
- Save episodes to personal library
- Organize with custom collections/folders
- Add personal notes and highlights
- Bookmark specific timestamps

### 4. Content Rating System (Priority: Medium)
- AI-generated "worth it" score based on content quality
- User ratings and reviews
- Personalized recommendations based on rating history
- Time investment indicator (quick insight vs. full listen)

## Tech Stack
- **Frontend**: Next.js 14+ (App Router)
- **Backend**: Next.js API Routes + Server Actions
- **Database**: PostgreSQL (Neon - serverless)
- **ORM**: Drizzle ORM
- **Styling**: Tailwind CSS + Shadcn/UI
- **Authentication**: Clerk (Username/Password + OAuth)
- **AI/LLM**: OpenRouter (Gemini Flash)
- **Podcast Data**: PodcastIndex API
- **Hosting**: Vercel

## Architecture
```
┌─────────────────────────────────────────────────────────┐
│                      Vercel Edge                        │
├─────────────────────────────────────────────────────────┤
│                    Next.js App Router                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │   Pages     │  │   API       │  │ Server Actions  │ │
│  │  (React)    │  │   Routes    │  │                 │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    Service Layer                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ PodcastIndex│  │  OpenRouter │  │    Clerk        │ │
│  │    API      │  │     API     │  │    Auth         │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│              Drizzle ORM + Neon PostgreSQL              │
└─────────────────────────────────────────────────────────┘
```

**Processing Model (Hybrid):**
- **On-Demand**: When a user searches for or views an episode, process it if not cached
- **Background**: For subscribed podcasts, automatically process new episodes
- Summaries are cached in the database to avoid reprocessing

## Data Model

### Users (managed by Clerk)
- id, email, name, avatar (synced from Clerk)
- preferences (notification settings, default view)

### Podcasts
- id, podcastIndexId, title, description, publisher
- imageUrl, rssFeedUrl, categories
- totalEpisodes, latestEpisodeDate

### Episodes
- id, podcastId, podcastIndexId, title, description
- audioUrl, duration, publishDate
- transcription, summary, keyTakeaways
- worthItScore, processedAt

### UserSubscriptions
- id, userId, podcastId, subscribedAt
- notificationsEnabled

### UserLibrary
- id, userId, episodeId, savedAt
- notes, rating, collectionId

### Collections
- id, userId, name, description, isDefault

### Bookmarks
- id, userLibraryId, timestamp, note

## UI/UX Requirements

### Design System
- Shadcn/UI components with Tailwind CSS
- Clean, minimal aesthetic focused on readability
- Dark/light mode support
- Mobile-responsive design

### Key Pages
1. **Dashboard** - Overview of subscriptions, recent summaries, recommendations
2. **Discover** - Search and browse podcasts
3. **Episode View** - Full summary, transcript, key takeaways, rating
4. **Library** - Saved episodes, collections, notes
5. **Settings** - Profile, preferences, connected accounts

### Component Library
- Card components for podcasts and episodes
- Summary display with expandable sections
- Audio player integration (optional - link to source)
- Rating/score visualization
- Search with filters

## Security Considerations
- Clerk handles all authentication (username/password + OAuth)
- API keys stored in environment variables (Vercel)
- Rate limiting on API routes
- User data isolation (users can only access their own data)
- HTTPS enforced via Vercel

## Third-Party Integrations

### PodcastIndex API
- Podcast search and discovery
- Episode metadata
- Transcription data (if available)
- **Required**: PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET

### OpenRouter API
- LLM access for summarization
- Model: Gemini Flash (cost-effective)
- **Required**: API key

### Clerk
- User authentication
- Session management
- Username/password authentication
- OAuth providers (Google, GitHub)
- **Required**: Clerk publishable + secret keys
- **Test credentials**: See CLAUDE.md for automated testing

## Constraints & Assumptions
- **API Limits**: PodcastIndex has rate limits; implement caching
- **Cost**: OpenRouter charges per token; use efficient prompts
- **Transcription**: Not all episodes have transcripts; may need fallback
- **MVP Scope**: No payment processing, no team features, no mobile app

## Success Criteria
MVP is complete when a user can:
1. Sign in with username/password or OAuth (Google, GitHub)
2. Search for and discover podcasts
3. Subscribe to podcasts
4. View AI-generated summaries of episodes
5. See a "worth it" rating to help decide if content is valuable
6. Save episodes to their personal library
7. Add notes and organize saved content into collections
8. All core flows work without errors

---

## Task List

```json
[
  {
    "category": "setup",
    "description": "Initialize Next.js project with TypeScript and Tailwind",
    "steps": [
      "Run npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias '@/*'",
      "Verify the project structure is created correctly",
      "Run npm run dev to confirm the app starts"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Install and configure Shadcn/UI",
    "steps": [
      "Run npx shadcn@latest init and select default options",
      "Install initial components: button, card, input, dialog, dropdown-menu, avatar, badge, skeleton",
      "Verify components are available in components/ui"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Set up Drizzle ORM with Neon PostgreSQL",
    "steps": [
      "Install drizzle-orm, drizzle-kit, and @neondatabase/serverless",
      "Create drizzle.config.ts in project root",
      "Create src/db/index.ts for database connection",
      "Create src/db/schema.ts with initial schema (users, podcasts, episodes, subscriptions, library, collections, bookmarks)",
      "Add database scripts to package.json (db:generate, db:push, db:studio)"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Configure Clerk authentication",
    "steps": [
      "Install @clerk/nextjs",
      "Create src/middleware.ts with Clerk middleware",
      "Wrap app in ClerkProvider in src/app/layout.tsx",
      "Create sign-in and sign-up pages at src/app/(auth)/sign-in/[[...sign-in]]/page.tsx and sign-up equivalent",
      "Add UserButton to header for signed-in users"
    ],
    "passes": true
  },
  {
    "category": "setup",
    "description": "Create base layout and navigation",
    "steps": [
      "Create src/components/layout/header.tsx with logo, navigation, and user menu",
      "Create src/components/layout/sidebar.tsx with main navigation links",
      "Update src/app/layout.tsx with the new layout components",
      "Create responsive mobile navigation",
      "Add dark mode toggle using next-themes"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement podcast search with PodcastIndex API",
    "steps": [
      "Create src/lib/podcastindex.ts with API client and types",
      "Create src/app/api/podcasts/search/route.ts API endpoint",
      "Create src/app/discover/page.tsx with search UI",
      "Create src/components/podcasts/search-results.tsx to display results",
      "Create src/components/podcasts/podcast-card.tsx for individual podcast display",
      "Add loading states and error handling"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement podcast detail and episode listing",
    "steps": [
      "Create src/app/podcast/[id]/page.tsx for podcast details",
      "Fetch podcast info and episodes from PodcastIndex",
      "Create src/components/podcasts/episode-list.tsx",
      "Create src/components/podcasts/episode-card.tsx",
      "Add subscribe button (UI only, functionality in next task)"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement podcast subscriptions",
    "steps": [
      "Create server action in src/app/actions/subscriptions.ts for subscribe/unsubscribe",
      "Store subscription in database (podcasts and user_subscriptions tables)",
      "Update podcast detail page to show subscription status",
      "Create src/app/subscriptions/page.tsx to list user subscriptions",
      "Add subscription count and latest episode info"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement AI summarization with OpenRouter",
    "steps": [
      "Create src/lib/openrouter.ts with API client",
      "Create summarization prompt template in src/lib/prompts.ts",
      "Create src/app/api/episodes/summarize/route.ts endpoint",
      "Implement caching - store summaries in episodes table",
      "Add worth-it score generation to the prompt"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement episode detail page with summary",
    "steps": [
      "Create src/app/episode/[id]/page.tsx",
      "Display episode metadata (title, podcast, duration, date)",
      "Show AI summary with key takeaways",
      "Display worth-it score with visual indicator",
      "Add loading state while summary generates",
      "Create src/components/episodes/summary-display.tsx"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement personal library - save episodes",
    "steps": [
      "Create server action in src/app/actions/library.ts for save/unsave",
      "Add save button to episode cards and detail page",
      "Create src/app/library/page.tsx to display saved episodes",
      "Show saved date and allow sorting",
      "Create src/components/library/saved-episode-card.tsx"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement collections for organizing saved content",
    "steps": [
      "Create server actions for CRUD collections in src/app/actions/collections.ts",
      "Create src/components/library/collection-dialog.tsx for create/edit",
      "Add move-to-collection functionality on saved episodes",
      "Create src/app/library/collection/[id]/page.tsx",
      "Display collections in library sidebar"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement notes and bookmarks on saved episodes",
    "steps": [
      "Add notes textarea to saved episode view",
      "Create server action to update notes in src/app/actions/library.ts",
      "Implement timestamp bookmarks with notes",
      "Create src/components/library/bookmarks-list.tsx",
      "Auto-save notes with debounce"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Implement user ratings on episodes",
    "steps": [
      "Create rating component src/components/episodes/rating-input.tsx (1-5 stars)",
      "Add server action to save rating",
      "Display user rating on library items",
      "Show average community rating on episodes (if multiple users rate)",
      "Update library sorting to include rating"
    ],
    "passes": true
  },
  {
    "category": "feature",
    "description": "Create dashboard with personalized content",
    "steps": [
      "Create src/app/dashboard/page.tsx as authenticated home",
      "Show recent episodes from subscribed podcasts",
      "Display recently saved items",
      "Add quick access to continue where left off",
      "Show personalized recommendations based on subscriptions"
    ],
    "passes": true
  },
  {
    "category": "styling",
    "description": "Polish UI and responsive design",
    "steps": [
      "Review all pages for mobile responsiveness",
      "Add proper loading skeletons to all async components",
      "Implement empty states for lists with no content",
      "Add toast notifications for user actions (save, subscribe, etc.)",
      "Ensure consistent spacing and typography throughout"
    ],
    "passes": false
  },
  {
    "category": "feature",
    "description": "Implement settings page",
    "steps": [
      "Create src/app/settings/page.tsx",
      "Add theme preference (light/dark/system)",
      "Add notification preferences (if implementing notifications later)",
      "Display connected OAuth accounts via Clerk",
      "Add account deletion option"
    ],
    "passes": false
  },
  {
    "category": "testing",
    "description": "End-to-end flow verification",
    "steps": [
      "Test complete sign-in flow with username/password (use test credentials from CLAUDE.md)",
      "Test search -> view podcast -> subscribe flow",
      "Test view episode -> generate summary -> save to library flow",
      "Test library organization with collections and notes",
      "Verify all error states are handled gracefully"
    ],
    "passes": false
  }
]
```

---

## Agent Instructions

1. Read `activity.md` first to understand current state
2. Find next task with `"passes": false`
3. Complete all steps for that task
4. Verify in browser using agent-browser
5. Update task to `"passes": true`
6. Log completion in `activity.md`
7. Repeat until all tasks pass

**Important:** Only modify the `passes` field. Do not remove or rewrite tasks.

---

## Completion Criteria
All tasks marked with `"passes": true`
