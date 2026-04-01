# 🔒 Security Audit — Final Report

> **Project:** Xine by Unisource — Privacy-first web analytics platform
> **Date:** 2026-03-31T02:00:00+03:00
> **Auditor:** AI Security Architect (Antigravity) — Principal AppSec & DevSecOps Lead persona
> **Scope:** Full codebase — zero-trust, hostile environment assumption
> **Methodology:** OWASP Top 10:2025, OWASP API Security Top 10:2023, vulnerability-scanner + api-security-best-practices skills

---

## Executive Summary

The Xine analytics platform has a **critical** security posture issue centered on a single, systemic vulnerability: **the authentication boundary is misconfigured in the middleware**, leaving approximately 40% of all API routes completely unauthenticated — including the most sensitive site management endpoints that expose API keys, enable data deletion, and permit full data export.

The most severe finding (VULN-001) allows any unauthenticated attacker to call `GET /api/sites` and receive all API keys and site metadata, then use those keys to exfiltrate analytics data via the external API, delete entire sites (cascading all data), modify privacy settings to make private sites public, and export visitor session data including IP hashes and geo-location. This single misconfiguration in `proxy.ts` (one line: line 119) effectively nullifies the entire authentication system for 10+ route groups.

Beyond the access control issue, the authentication mechanism itself has fundamental weaknesses: the password is compared in plaintext (enabling timing attacks), the HMAC session token uses the password as its key (enabling token forging by anyone who knows the password), and sessions are stateless with no revocation capability. The 3-attempt brute-force protection is bypassable by rotating the User-Agent header. Cron endpoints have a conditional auth check that fails open when the `CRON_SECRET` environment variable is unset, enabling SSRF attacks via unauthenticated triggering of uptime checks against attacker-controlled URLs.

**Immediate action required:** Fix the proxy.ts middleware whitelist to protect `/api/sites`, `/api/debug`, and `/api/cron` routes behind authentication. This single change addresses findings VULN-001, VULN-002, VULN-003, VULN-013, and VULN-015 — covering 5 of the 18 findings including 3 Critical and 1 High.

---

## Risk Matrix

| Severity | Count | Key Examples |
|----------|-------|-------------|
| 🔴 Critical | **5** | Unauthenticated site CRUD with API key exposure, debug endpoint, cron auth bypass + SSRF, plaintext password comparison, non-invalidatable sessions |
| 🟠 High | **6** | Ban bypass, fail-open on DB error, CORS reflected origin + credentials, no input validation on /api/collect (stored XSS), replay PII exposure, mass assignment on site config |
| 🟡 Medium | **5** | SSL verify disabled, no security headers, SSRF via uptime URLs, Docker default creds, over-fetching sensitive data |
| 🔵 Low | **2** | Predictable IP hash salt, no dashboard API rate limiting |
| **Total** | **18** | |

---

## Critical Findings (Immediate Action Required)

### VULN-001 — Unauthenticated Site Management
**File:** `src/proxy.ts` line 119 → whitelists all `/api/sites/*` routes
**Impact:** Full data breach — any unauthenticated user can read, create, modify, delete ALL sites and ALL analytics data. API keys exposed in GET responses enable cascading data exfiltration via /api/v1/stats.
**Fix priority:** 🔴 IMMEDIATE — remove `/api/sites` from proxy.ts whitelist.

### VULN-002 — Debug Endpoint Exposed
**File:** `src/proxy.ts` line 120 → whitelists `/api/debug`
**Impact:** Infrastructure reconnaissance (Node version, DB host, DB name, all sites, sample analytics data).
**Fix priority:** 🔴 IMMEDIATE — remove from whitelist or disable in production.

### VULN-003 — Cron Auth Bypass + SSRF
**File:** `src/app/api/cron/uptime/route.ts` lines 7-9
**Impact:** SSRF to cloud metadata/internal services. DoS via report generation.
**Fix priority:** 🔴 IMMEDIATE — make CRON_SECRET mandatory, change to fail-closed.

### VULN-004 — Plaintext Password Comparison
**File:** `src/app/api/auth/login/route.ts` line 82
**Impact:** Timing attack password extraction. Any env var leak = instant compromise.
**Fix priority:** 🔴 HIGH — switch to bcrypt + constant-time comparison.

### VULN-005 — Non-Invalidatable HMAC Sessions
**File:** `src/proxy.ts` lines 51-81 + `src/app/api/auth/login/route.ts` lines 15-22
**Impact:** 7-day irrevocable tokens. Password = HMAC key = unlimited token forging.
**Fix priority:** 🔴 HIGH — separate HMAC secret, add server-side session store.

---

## Architecture Security Assessment

### Authentication Model: ⚠️ WEAK
- Single-user password system with no hashing, no timing-safe comparison
- HMAC token uses the password as the signing key — conflating authentication and authorization
- No session store = no revocation = no forced logout
- Ban system bypassable and fails open

### Access Control: 🔴 BROKEN
- Middleware whitelist is over-permissive — 10+ route groups incorrectly marked as public
- No RBAC (single-user, but the single user's routes are not properly isolated)
- API keys returned in list endpoints — credential leakage by design

### Data Flow Security: 🟠 NEEDS WORK
- `/api/collect` accepts arbitrary untrusted data with no validation
- Session replay stores raw DOM snapshots potentially containing PII
- IP hashing uses a predictable salt
- No input sanitization = stored XSS risk in dashboard

### Infrastructure: 🟡 ACCEPTABLE
- Dockerfile runs as non-root (good)
- Docker-compose has default credentials (risk if not changed)
- No security headers configured
- SSL verification disabled for cloud DB connections

---

## Remediation Priority Matrix

> Ordered by `Risk = Likelihood × Impact` with quick-win potential noted.

| Priority | VULN | Fix Effort | Impact Reduction |
|----------|------|-----------|-----------------|
| **1** | VULN-001 | 🟢 1 line change in proxy.ts | Eliminates unauthenticated access to 10+ route groups |
| **2** | VULN-002 | 🟢 1 line change in proxy.ts | Closes infrastructure recon vector |
| **3** | VULN-003 | 🟢 2 line changes in cron routes + add CRON_SECRET to .env.example | Closes SSRF + auth bypass |
| **4** | VULN-004 | 🟡 ~30 min — bcrypt hash + timing-safe compare | Eliminates timing attack vector |
| **5** | VULN-005 | 🔴 ~2-4 hours — session store + separate secret | Enables session management |
| **6** | VULN-009 | 🟡 ~1 hour — add Zod validation to /api/collect | Eliminates stored XSS + CSV injection |
| **7** | VULN-006 | 🟡 ~30 min — global rate limit + CAPTCHA | Strengthens brute-force protection |
| **8** | VULN-007 | 🟢 1 line change — reverse fail condition | Closes fail-open vulnerability |
| **9** | VULN-015 | 🟢 Fixed by VULN-001 fix | N/A — cascading fix |
| **10** | VULN-012 | 🟡 ~30 min — add headers to next.config.ts | Adds clickjacking/HSTS/CSP protection |
| **11** | VULN-008 | 🟢 Remove `Allow-Credentials` | Fixes CORS anti-pattern |
| **12** | VULN-010 | 🟡 ~1 hour — payload size limits + PII scrubbing | Mitigates DoS + privacy risk |
| **13** | VULN-017 | 🟡 ~30 min — specify columns in select() calls | Reduces data exposure surface |
| **14** | VULN-011 | 🟢 Config change | Enables proper SSL for cloud DBs |
| **15** | VULN-016 | 🟢 Remove defaults from docker-compose | Prevents known-credential deployments |
| **16** | VULN-013 | 🟡 URL validation + IP range deny list | Prevents SSRF via uptime checks |
| **17** | VULN-014 | 🟢 Add random secret to salt | Prevents IP de-anonymization |
| **18** | VULN-018 | 🟡 Add per-session rate limiting | Prevents dashboard DoS |

---

## Appendix

### Files Audited: 42
- Authentication: `proxy.ts`, `login/route.ts`, `logout/route.ts`, `login/page.tsx`
- API Routes (Public): `collect/route.ts`, `collect/replay/route.ts`, `config/[apiKey]/route.ts`, `public/overview/route.ts`, `v1/stats/route.ts`, `debug/route.ts`
- API Routes (Protected): `dashboard/overview`, `dashboard/analytics`, `dashboard/realtime`, `dashboard/performance`, `dashboard/behavior`, `dashboard/acquisition`, `dashboard/seo`, `dashboard/events`, `dashboard/goals`, `dashboard/funnels`, `dashboard/retention`, `dashboard/replay`, `dashboard/replay/[id]`, `dashboard/alerts`, `dashboard/reports`, `dashboard/uptime`, `dashboard/site-detail`, `dashboard/banned-logins`
- Site Management: `sites/route.ts`, `sites/[siteId]/route.ts`, `sites/[siteId]/export`, `sites/[siteId]/settings`, `sites/[siteId]/goals`, `sites/[siteId]/funnels`, `sites/[siteId]/annotations`
- Cron: `cron/uptime/route.ts`, `cron/reports/route.ts`
- Database: `lib/db/index.ts`, `lib/db/schema.ts`, `lib/db/relations.ts`, `lib/queries.ts`, `lib/queries-advanced.ts`
- Configuration: `next.config.ts`, `.env.example`, `.gitignore`, `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`
- Client: `public/t.js`, `src/tracking.js`
- Layout: `layout.tsx`

### Files Skipped: 0
All files on the checklist were audited.

### Tools Used
- `vulnerability-scanner` skill (Python security_scan.py — automated secret/pattern/config scanning)
- `api-security-best-practices` skill (OWASP API Top 10 checklist)
- `ripgrep` (pattern matching for XSS, CORS, SQL injection, env vars, redirects, TLS bypass)
- `npm audit` (dependency vulnerability scanning — 8 vulnerabilities found across 549 deps)
- Manual code review (file-by-file analysis per workflow specification)

### Methodology
- OWASP Top 10:2025 (A01-A10)
- OWASP API Security Top 10:2023
- Threat modeling (assets, actors, vectors, impact)
- Attack chain hypothesis testing
- Risk prioritization: `Risk = Likelihood × Impact`
