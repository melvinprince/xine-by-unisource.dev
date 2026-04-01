# Audit Scratchpad — Internal Memory
> Working notes, data flow traces, cross-file analysis

## Threat Model

### 1. What are we protecting? (Assets)
- **Dashboard credentials** — single DASHBOARD_PASSWORD env var grants full access
- **Analytics data** — pageviews, sessions, events, user behavior across all tracked sites
- **Session replay data** — DOM snapshots that may contain PII from end-user websites
- **API keys** — per-site api_key and server_api_key for data ingestion and external API
- **Site configurations** — tracked domains, feature flags, goal definitions
- **Visitor data** — geo-location, browser fingerprints, IP-derived data, UTM parameters

### 2. Who would attack? (Threat actors)
- **External hackers** — targeting the public /api/collect, /api/config, /api/v1 endpoints
- **Competitors** — attempting to access analytics data of tracked websites
- **Automated bots** — brute-forcing the single-password login
- **Malicious website operators** — injecting poisoned data through t.js collection
- **MITM attackers** — intercepting session cookies or API keys in transit

### 3. How would they attack? (Attack vectors — ranked by likelihood)
1. Brute-force the single DASHBOARD_PASSWORD (no user enumeration needed, single-user system)
2. Inject malicious payloads via /api/collect (public, unauthenticated, high volume)
3. Forge/predict HMAC session tokens if secret is weak
4. IDOR via siteId parameter manipulation in /api/sites/[siteId]/* routes
5. Data exfiltration via /api/debug or /api/public/* endpoints
6. XSS via stored analytics data rendered in dashboard (referrer, page titles, UTM params)
7. SSRF via uptime check URLs submitted through dashboard
8. Supply chain attack via compromised npm dependencies

### 4. What's the impact? (Business risk)
- **Critical:** Full dashboard takeover → access to all analytics data across all sites
- **High:** Data poisoning → corrupted analytics leading to bad business decisions
- **High:** Session replay data exposure → PII leak from tracked websites
- **Medium:** API key theft → ability to inject fake data or read site configs
- **Low:** Service disruption → analytics data loss during downtime

## Data Entry Points (Sinks)
- `POST /api/collect` — t.js sends pageview/event data (UNAUTHENTICATED)
- `POST /api/collect/replay` — t.js sends session replay data (UNAUTHENTICATED)
- `GET /api/config/[apiKey]` — t.js fetches feature flags (UNAUTHENTICATED)
- `POST /api/auth/login` — dashboard login (UNAUTHENTICATED)
- `POST /api/sites` — create new tracked site (AUTHENTICATED)
- `PUT/PATCH /api/sites/[siteId]/*` — modify site settings (AUTHENTICATED)
- `POST /api/dashboard/*` — dashboard API queries (AUTHENTICATED)
- `GET /api/v1/stats` — external API (API KEY AUTH)
- `GET /api/public/overview` — public dashboard (PUBLIC BY DESIGN)
- `GET /api/debug` — debug endpoint (UNKNOWN AUTH)
- `POST /api/cron/*` — scheduled tasks (UNKNOWN AUTH)

## Trust Boundaries
- **proxy.ts middleware** — validates HMAC session cookie on /dashboard/* and /api/dashboard/*
- **API key validation** — /api/v1/* routes validate server_api_key per site
- **No auth boundary** — /api/collect, /api/collect/replay, /api/config/[apiKey] are open
- **UNKNOWN** — /api/cron/*, /api/debug, /api/sites/* — need to verify auth enforcement

## Cross-File Traces
[To be populated during deep analysis]

## Open Questions
- Does proxy.ts protect /api/sites/* routes?
- Are cron endpoints protected from external access?
- Is the debug endpoint exposed in production?
- Does the /api/collect endpoint validate the API key against a real site?
- Can a visitor ID in localStorage be used to correlate users across sites?

## Attack Chain Hypotheses
1. **Chain A:** Brute-force login → access dashboard → export all site data → pivot to session replays containing PII
2. **Chain B:** Inject malicious data via /api/collect → stored XSS in dashboard → steal admin session cookie
3. **Chain C:** Enumerate API keys via timing attacks on /api/config/[apiKey] → inject fake data for any site
4. **Chain D:** Access /api/debug in production → leak database connection details → direct DB access
