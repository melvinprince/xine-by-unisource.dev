# Security Audit Checklist
> Generated: 2026-03-31T01:47:00+03:00
> Completed: 2026-03-31T02:10:00+03:00
> Project: Xine by Unisource — Privacy-first web analytics
> Status: ✅ COMPLETE — 18 findings documented

## Files Audited

### Authentication & Authorization
- [x] `src/proxy.ts` — **VULN-001, VULN-002, VULN-003, VULN-005, VULN-007**
- [x] `src/app/api/auth/login/route.ts` — **VULN-004, VULN-005, VULN-006**
- [x] `src/app/api/auth/logout/route.ts` — Clean
- [x] `src/app/login/page.tsx` — Client-side only, no server-side findings

### API Routes — Public
- [x] `src/app/api/collect/route.ts` — **VULN-008, VULN-009, VULN-014**
- [x] `src/app/api/collect/replay/route.ts` — **VULN-008, VULN-010**
- [x] `src/app/api/config/[apiKey]/route.ts` — Clean (CORS * is intentional for tracking)
- [x] `src/app/api/public/overview/route.ts` — Clean (proper is_public check)
- [x] `src/app/api/v1/stats/route.ts` — Clean (proper Bearer token auth + api_access_enabled check)
- [x] `src/app/api/debug/route.ts` — **VULN-002**

### API Routes — Protected (Dashboard)
- [x] `src/app/api/dashboard/overview/route.ts` — Clean (behind proxy.ts auth)
- [x] `src/app/api/dashboard/analytics/route.ts` — Clean
- [x] `src/app/api/dashboard/realtime/route.ts` — Clean
- [x] `src/app/api/dashboard/performance/route.ts` — Clean
- [x] `src/app/api/dashboard/behavior/route.ts` — Clean
- [x] `src/app/api/dashboard/acquisition/route.ts` — Clean
- [x] `src/app/api/dashboard/seo/route.ts` — Clean
- [x] `src/app/api/dashboard/events/route.ts` — Clean
- [x] `src/app/api/dashboard/goals/route.ts` — Clean
- [x] `src/app/api/dashboard/funnels/route.ts` — Clean
- [x] `src/app/api/dashboard/retention/route.ts` — Clean (uses parameterized sql``)
- [x] `src/app/api/dashboard/replay/route.ts` — Clean
- [x] `src/app/api/dashboard/replay/[id]/route.ts` — Clean
- [x] `src/app/api/dashboard/alerts/route.ts` — Clean
- [x] `src/app/api/dashboard/reports/route.ts` — Clean
- [x] `src/app/api/dashboard/uptime/route.ts` — Clean
- [x] `src/app/api/dashboard/site-detail/route.ts` — Clean
- [x] `src/app/api/dashboard/banned-logins/route.ts` — **VULN-017** (over-fetching)

### API Routes — Site Management (UNAUTHENTICATED!)
- [x] `src/app/api/sites/route.ts` — **VULN-001, VULN-017**
- [x] `src/app/api/sites/[siteId]/route.ts` — **VULN-001, VULN-015**
- [x] `src/app/api/sites/[siteId]/annotations/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/annotations/[annotationId]/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/export/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/funnels/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/funnels/[funnelId]/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/goals/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/goals/[goalId]/route.ts` — **VULN-001**
- [x] `src/app/api/sites/[siteId]/settings/route.ts` — **VULN-001**

### Cron / Scheduled Tasks
- [x] `src/app/api/cron/reports/route.ts` — **VULN-003**
- [x] `src/app/api/cron/uptime/route.ts` — **VULN-003, VULN-013**

### Database
- [x] `src/lib/db/schema.ts` — Clean (proper Drizzle schema)
- [x] `src/lib/db/relations.ts` — Clean
- [x] `src/lib/db/index.ts` — **VULN-011**
- [x] `src/lib/queries.ts` — Clean (parameterized Drizzle queries)
- [x] `src/lib/queries-advanced.ts` — Clean
- [x] `src/lib/api-key-cache.ts` — Clean
- [x] `src/lib/goals-cache.ts` — Clean

### Configuration & Infrastructure
- [x] `next.config.ts` — **VULN-012**
- [x] `drizzle.config.ts` — Clean
- [x] `.env.example` — Clean (no secrets)
- [x] `.env.local` — Excluded from git ✅
- [x] `docker-compose.yml` — **VULN-016**
- [x] `Dockerfile` — Clean (non-root user, multi-stage)
- [x] `docker-entrypoint.sh` — Clean
- [x] `.gitignore` — Clean (properly excludes .env*, deploy.ps1)
- [x] `deploy.ps1` — Excluded from git ✅
- [x] `deploy.example.ps1` — Clean

### Client Scripts & Static
- [x] `public/t.js` — Clean (minified tracking script)
- [x] `src/tracking.js` — Clean (source version)
- [x] `src/app/layout.tsx` — False positive (dangerouslySetInnerHTML with hardcoded static script, no user input)

### Types & Utilities
- [x] `src/lib/types.ts` — Clean
- [x] `src/lib/utils.ts` — Clean
