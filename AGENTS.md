# AGENTS.md — Xine by Unisource

> Comprehensive project context for AI coding assistants (Codex, Copilot, Cursor, etc.)

## Project Overview

**Xine** is a privacy-first, self-hosted web analytics platform. It's a lightweight, cookie-free alternative to Google Analytics built with Next.js. Users embed a tiny tracking script (`t.js`) on their website, and data flows into a PostgreSQL database powering a premium dark-mode dashboard.

- **License:** AGPL-3.0
- **Author:** Melvin Prince
- **Branding:** "Xine by Unisource"

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| Database | PostgreSQL | 16+ |
| ORM | Drizzle ORM (`drizzle-orm/node-postgres`) | 0.45.x |
| DB Driver | `pg` (node-postgres `Pool`) | 8.x |
| Animations | GSAP + `@gsap/react` | 3.x |
| Charts | Recharts | 3.x |
| Icons | Lucide React | 0.577+ |
| Font | Poppins (Google Fonts) | — |

---

## Architecture

### Directory Structure

```
xine/
├── public/
│   ├── t.js                    # Minified tracking script (served as static file)
│   ├── xine-logo-black.png     # Light theme logo
│   └── xine-logo-white.png     # Dark theme logo
├── src/
│   ├── proxy.ts                # Middleware: HMAC session auth (Edge-compatible)
│   ├── tracking.js             # Source (unminified) tracking script
│   ├── app/
│   │   ├── layout.tsx          # Root layout (Poppins font, ThemeProvider)
│   │   ├── globals.css         # Full design system tokens + component styles
│   │   ├── page.tsx            # Root redirect → /dashboard
│   │   ├── login/page.tsx      # Password-only login page (GSAP animated)
│   │   ├── share/              # Public shared dashboard views
│   │   ├── dashboard/
│   │   │   ├── layout.tsx      # Dashboard shell (Sidebar + Header + DashboardContext)
│   │   │   ├── page.tsx        # Overview dashboard
│   │   │   ├── realtime/       # Live visitor tracking
│   │   │   ├── analytics/      # Traffic analytics
│   │   │   ├── performance/    # Web Vitals (LCP, FCP, CLS, INP, TTFB)
│   │   │   ├── behavior/       # User behavior: scroll depth, clicks, rage clicks
│   │   │   ├── acquisition/    # Traffic sources, UTM campaigns, referrers
│   │   │   ├── seo/            # SEO metrics and page performance
│   │   │   ├── goals/          # Goal tracking and conversions
│   │   │   ├── retention/      # Returning visitor analysis
│   │   │   ├── funnels/        # Conversion funnel builder
│   │   │   ├── events/         # Custom event tracking
│   │   │   ├── annotations/    # Chart annotations
│   │   │   ├── replay/         # Session replay viewer
│   │   │   ├── monitors/       # Uptime monitoring + alerts
│   │   │   ├── settings/       # Site settings + integration snippet
│   │   │   └── debug/          # Debug tooling
│   │   └── api/
│   │       ├── auth/           # login + logout routes
│   │       ├── collect/        # POST /api/collect — t.js data ingestion
│   │       │   └── replay/     # POST /api/collect/replay — session replay data
│   │       ├── config/[apiKey] # GET feature flags for t.js
│   │       ├── dashboard/      # 16 protected API route groups (overview, analytics, etc.)
│   │       ├── sites/          # CRUD for tracked sites
│   │       ├── public/         # Public API (shared dashboards)
│   │       ├── v1/             # External API (server-side API key auth)
│   │       ├── cron/           # Scheduled tasks
│   │       └── debug/          # Debug endpoints
│   ├── components/
│   │   ├── Sidebar.tsx         # Collapsible nav sidebar (GSAP animated)
│   │   ├── Header.tsx          # Top header with site selector
│   │   ├── ThemeProvider.tsx    # Dark/light/system theme context
│   │   ├── ThemeToggle.tsx     # Theme switcher button
│   │   ├── DashboardContext.tsx # React context for selected site + date range
│   │   ├── DateRangePicker.tsx # Date range selector component
│   │   ├── SiteSelector.tsx    # Site switcher dropdown
│   │   ├── StatCard.tsx        # Metric card with trend indicators
│   │   ├── DataTable.tsx       # Generic sortable data table
│   │   ├── DataStates.tsx      # Loading/empty/error state components
│   │   ├── IntegrationSnippet.tsx # Tracking code snippet display
│   │   ├── EnableFeatureBanner.tsx # Feature flag enable prompt
│   │   ├── FeatureGuide.tsx    # Feature documentation component
│   │   ├── HelpTooltip.tsx     # Contextual help tooltips
│   │   └── charts/
│   │       ├── VisitorChart.tsx   # Time series area chart (Recharts)
│   │       ├── BarChart.tsx       # Horizontal/vertical bar chart
│   │       ├── DonutChart.tsx     # Donut/pie chart
│   │       ├── FunnelChart.tsx    # Conversion funnel visualization
│   │       ├── HeatmapChart.tsx   # Activity heatmap
│   │       └── WebVitalsGauge.tsx # Core Web Vitals gauge meters
│   ├── hooks/
│   │   ├── use-dashboard-data.ts   # SWR-like data fetcher for dashboard APIs
│   │   ├── use-advanced-data.ts    # Advanced analytics data fetcher
│   │   └── use-sites.ts           # Site list fetcher + CRUD operations
│   └── lib/
│       ├── db/
│       │   ├── schema.ts      # Drizzle schema (13 tables)
│       │   ├── relations.ts   # Drizzle table relations
│       │   └── index.ts       # Database connection pool (Pool-based)
│       ├── queries.ts         # Core SQL queries (overview, analytics, pageviews)
│       ├── queries-advanced.ts # Advanced queries (behavior, acquisition, SEO, retention)
│       ├── types.ts           # TypeScript interfaces for all data shapes
│       ├── utils.ts           # Shared utility functions
│       ├── api-key-cache.ts   # In-memory API key → site_id cache
│       └── goals-cache.ts     # In-memory goals cache for real-time evaluation
├── drizzle/                   # Migration files (auto-generated by drizzle-kit)
├── drizzle.config.ts          # Drizzle Kit configuration
├── next.config.ts             # Next.js config (headers for t.js caching + CORS)
├── Dockerfile                 # Multi-stage Docker build
├── docker-compose.yml         # Docker Compose (app + postgres)
└── deploy.example.ps1         # PowerShell deployment script template
```

### Data Flow

```
Website visitor → t.js script → POST /api/collect → PostgreSQL
                                     ↓
                              Goal evaluation (real-time)
                                     ↓
Dashboard user → Login → /dashboard/* → /api/dashboard/* → Drizzle queries → PostgreSQL
```

---

## Database Schema (13 tables)

| Table | Purpose |
|-------|---------|
| `sites` | Tracked websites (domain, API keys, public/private) |
| `pageviews` | Individual page view events with geo, browser, UTM data |
| `events` | Custom events (clicks, scroll depth, web vitals, etc.) |
| `sessions` | Pre-computed session aggregates (entry/exit page, duration, bounce) |
| `site_settings` | Feature flags per site (web vitals, scroll depth, replay, etc.) |
| `goals` | Goal definitions (pageview/event/duration-based) |
| `goal_conversions` | Goal conversion records (deduplicated per session) |
| `funnels` | Multi-step funnel definitions |
| `annotations` | User-created chart annotations |
| `replay_events` | Session replay event payloads |
| `email_reports` | Scheduled email report config |
| `uptime_checks` | Uptime monitoring results |
| `alerts` | Alert/notification rule definitions |

---

## Authentication

- **Single-user, password-only** — no user accounts or registration.
- Password is set via `DASHBOARD_PASSWORD` env var.
- Login creates an HMAC-signed session cookie (`analytics_session`).
- Token format: `timestamp.hmac_sha256_signature`
- `proxy.ts` middleware validates the cookie on all `/dashboard/*` and `/api/dashboard/*` routes.
- Uses Web Crypto API for Edge Runtime compatibility.
- External API access uses a separate `server_api_key` per site (`/api/v1/*`).

---

## Tracking Script (`t.js`)

- **Source:** `src/tracking.js` (human-readable)
- **Production:** `public/t.js` (minified, ~8KB)
- Cookie-free: uses `localStorage` (visitor ID) + `sessionStorage` (session ID)
- Auto-detects API endpoint from script `src` attribute
- Fetches feature flags from `/api/config/[apiKey]` at runtime
- Tracks: pageviews, custom events, web vitals (LCP/FCP/CLS/INP), scroll depth, outbound clicks, JS errors, click tracking, rage clicks, file downloads, form abandonment, session replay

---

## Design System

- All design tokens are in `src/app/globals.css` using CSS custom properties
- Premium dark-mode-first palette with vibrant accent colors
- Glass-morphism card styling (`.glass-card`)
- Theme toggling via `data-theme="dark"` attribute on `<html>`
- Logo switching: `.theme-light-logo` / `.theme-dark-logo` CSS classes
- GSAP powers all page transitions and micro-animations

---

## Environment Variables

```env
# Option A: Self-Hosted PostgreSQL (Docker/VPS)
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=analytics_db

# Option B: Cloud PostgreSQL (Supabase, Neon, Railway)
# DATABASE_URL=postgresql://user:password@host:5432/database
# STANDALONE_OUTPUT=false

# Dashboard Authentication
DASHBOARD_PASSWORD=your_secure_password
```

---

## Key Commands

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npx drizzle-kit push # Push schema to database
npx drizzle-kit generate  # Generate migration files
```

---

## Deployment Options

1. **Docker** — `docker-compose up` (includes PostgreSQL)
2. **VPS** — Standalone Node.js with PM2 + Nginx reverse proxy
3. **Vercel** — Set `STANDALONE_OUTPUT=false`, use Supabase/Neon pooler URL (port 6543)

---

## Code Conventions

- **Components:** Functional React + hooks, inline styles for component-specific styling, CSS classes from globals.css for shared patterns
- **API Routes:** Next.js App Router `route.ts` handlers, all return JSON, protected routes via proxy.ts middleware
- **Database:** Always use Drizzle ORM query builder, never raw SQL strings. Import `db` from `@/lib/db`. Import schema tables from `@/lib/db/schema`.
- **Queries:** Core queries in `lib/queries.ts`, advanced in `lib/queries-advanced.ts`. All queries accept `siteId` and date range parameters.
- **Types:** All TypeScript interfaces in `lib/types.ts`
- **Animations:** Use GSAP with `useGSAP` hook from `@gsap/react`. Register plugins with `gsap.registerPlugin()`.
- **Icons:** Use `lucide-react` for all icons
- **Error handling:** API routes wrap in try/catch, return `{ error: string }` with appropriate HTTP status
- **No cookies for tracking:** The tracking script is intentionally cookie-free for privacy compliance
