# Active Security Findings
> Last Updated: 2026-03-31T02:05:00+03:00
> Total Findings: 18

---

## 🔴 Critical (5)

### [VULN-001] Unauthenticated Site Management — Full CRUD Without Auth
- **Severity:** 🔴 Critical
- **Category:** A01:2025 Broken Access Control
- **Location:** `src/proxy.ts` → `proxy()` → Line 119 AND `src/app/api/sites/route.ts` (GET/POST), `src/app/api/sites/[siteId]/route.ts` (DELETE/PATCH), `src/app/api/sites/[siteId]/export/route.ts` (GET), `src/app/api/sites/[siteId]/settings/route.ts` (GET/PUT), `src/app/api/sites/[siteId]/goals/route.ts` (GET/POST), `src/app/api/sites/[siteId]/goals/[goalId]/route.ts` (DELETE), `src/app/api/sites/[siteId]/funnels/route.ts` (GET/POST), `src/app/api/sites/[siteId]/funnels/[funnelId]/route.ts` (DELETE), `src/app/api/sites/[siteId]/annotations/route.ts` (GET/POST), `src/app/api/sites/[siteId]/annotations/[annotationId]/route.ts` (DELETE)
- **The Exploit Scenario:**
  1. `proxy.ts` line 119 whitelists `pathname.startsWith("/api/sites")` — bypassing ALL auth.
  2. `GET /api/sites` returns full list including `api_key`, `server_api_key`, domain, IDs.
  3. `DELETE /api/sites/[siteId]` cascades delete of ALL analytics data (pageviews, events, sessions).
  4. `GET /api/sites/[siteId]/export?type=sessions&format=json` exports all session data with visitor IDs, IP hashes, geo, UA.
  5. `PUT /api/sites/[siteId]/settings` modifies feature flags (enable session replay on victim site).
  6. `POST /api/sites/[siteId]/goals` creates goal definitions that affect real-time data processing.
  7. With stolen `server_api_key`, pivot to `GET /api/v1/stats` for full analytics exfiltration.
- **Impact:** Complete data breach — read, create, modify, delete ALL sites and analytics data. API key exposure enables cascading attacks. Destructive data deletion.
- **Remediation Strategy:** Remove `/api/sites` from the proxy.ts whitelist. All `/api/sites/*` routes must require HMAC session cookie authentication.

### [VULN-002] Unauthenticated Debug Endpoint Exposes Infrastructure
- **Severity:** 🔴 Critical
- **Category:** A02:2025 Security Misconfiguration
- **Location:** `src/proxy.ts` → Line 120 AND `src/app/api/debug/route.ts` → Lines 1-171
- **The Exploit Scenario:**
  1. `GET /api/debug` — no auth — returns: Node.js version, NODE_ENV, partial DB_HOST, DB_NAME, DB connection status, ALL site IDs/names/domains, latest 10 pageviews (visitor_id, session_id, browser, country, device, duration), latest 10 events (visitor_id, event names), 7-day counts.
  2. Attacker uses partial DB_HOST for infrastructure recon. Site IDs enable VULN-001 exploitation.
- **Impact:** Full infrastructure reconnaissance and sample data exposure without authentication.
- **Remediation Strategy:** Remove `/api/debug` from proxy.ts whitelist, or disable entirely in production via NODE_ENV check.

### [VULN-003] Cron Endpoints — Conditional Auth Bypass + SSRF
- **Severity:** 🔴 Critical
- **Category:** A01:2025 Broken Access Control + SSRF
- **Location:** `src/app/api/cron/uptime/route.ts` → Lines 7-9 AND `src/app/api/cron/reports/route.ts` → Lines 10-12
- **The Exploit Scenario:**
  1. Auth is conditional: `if (cronSecret && authHeader !== ...)`. If `CRON_SECRET` is unset (not in .env.example), auth is completely skipped.
  2. Proxy.ts also whitelists `/api/cron` (line 117).
  3. `GET /api/cron/uptime` makes HTTP HEAD requests to ALL tracked site domains — SSRF if attacker creates site with internal URL via VULN-001.
  4. `GET /api/cron/reports` triggers email report generation for all configured reports.
- **Impact:** SSRF to internal infrastructure (cloud metadata, internal services). DoS via report generation. Domain enumeration.
- **Remediation Strategy:** Make CRON_SECRET mandatory. Change to fail-closed: `if (!cronSecret || authHeader !== ...)`. URL-validate uptime targets.

### [VULN-004] Plaintext Password Comparison — No Hashing, Timing Attack
- **Severity:** 🔴 Critical
- **Category:** A07:2025 Authentication Failures
- **Location:** `src/app/api/auth/login/route.ts` → Line 82
- **The Exploit Scenario:**
  1. `password !== dashboardPassword` — plaintext comparison, NOT constant-time.
  2. Timing side-channel attack can extract password character-by-character.
  3. Any env var leak directly exposes the master credential.
- **Impact:** Password extractable via timing attacks. Environment variable exposure = instant full compromise.
- **Remediation Strategy:** Use bcrypt hash in env var + `crypto.timingSafeEqual()` for comparison.

### [VULN-005] HMAC Token = Password — Non-Invalidatable Sessions
- **Severity:** 🔴 Critical
- **Category:** A07:2025 Authentication Failures
- **Location:** `src/proxy.ts` → Lines 51-81 AND `src/app/api/auth/login/route.ts` → Lines 15-22
- **The Exploit Scenario:**
  1. HMAC key IS the DASHBOARD_PASSWORD. Anyone with the password can forge tokens.
  2. Tokens are stateless — valid for 7 days, no revocation mechanism.
  3. Logout only clears the browser cookie — stolen tokens remain valid.
  4. Only way to invalidate = change DASHBOARD_PASSWORD (invalidates ALL sessions).
- **Impact:** Irrevocable 7-day tokens. No forced logout. Password knowledge = unlimited token forging.
- **Remediation Strategy:** Use separate HMAC secret. Implement server-side session store. Add token rotation.

---

## 🟠 High (6)

### [VULN-006] Ban Bypass via IP/User-Agent Rotation
- **Severity:** 🟠 High
- **Category:** A07:2025 Authentication Failures
- **Location:** `src/app/api/auth/login/route.ts` → Lines 46-48, 84-87
- **The Exploit Scenario:** Ban keys on `(ip, user_agent)` tuple. Changing either resets the counter. 3 × ∞ attempts with rotating UAs.
- **Impact:** Brute-force protection trivially bypassable.
- **Remediation Strategy:** Track global failed attempts. Add exponential backoff and CAPTCHA.

### [VULN-007] Ban Check Fails Open on Database Error
- **Severity:** 🟠 High
- **Category:** A10:2025 Exceptional Conditions
- **Location:** `src/proxy.ts` → `isIpBanned()` → Lines 33-36
- **The Exploit Scenario:** Comment states `// Fail open — don't block if DB is unreachable`. DB exhaustion (e.g. via /api/collect flooding) triggers fail-open, unblocking banned IPs.
- **Impact:** Banned IPs regain access during database outages.
- **Remediation Strategy:** Fail closed. Use in-memory cache as primary check.

### [VULN-008] CORS Reflected Origin with Credentials
- **Severity:** 🟠 High
- **Category:** A02:2025 Security Misconfiguration
- **Location:** `src/app/api/collect/route.ts` → Lines 89-99 AND `src/app/api/collect/replay/route.ts` → Lines 11-21
- **The Exploit Scenario:** `origin = request.headers.get("origin") || "*"` reflected + `Allow-Credentials: true`. Any website can make credentialed cross-origin requests.
- **Impact:** Security anti-pattern enabling potential future exploitation.
- **Remediation Strategy:** Remove `Allow-Credentials` or validate origin against tracked site domains.

### [VULN-009] No Input Validation on /api/collect — Stored XSS + CSV Injection
- **Severity:** 🟠 High
- **Category:** A05:2025 Injection
- **Location:** `src/app/api/collect/route.ts` → Lines 166-340
- **The Exploit Scenario:** All fields (`url`, `title`, `referrer`, UTM params, `browser`, `os`, `device`, etc.) cast to strings with zero validation. Injected HTML/JS renders as stored XSS in dashboard. CSV injection payloads execute in spreadsheet apps via export.
- **Impact:** Stored XSS in dashboard. CSV injection in exports. Storage exhaustion via oversized payloads.
- **Remediation Strategy:** Max string lengths, URL format validation, HTML entity escaping, CSV formula sanitization.

### [VULN-010] Replay Events — No Size Limits, PII Exposure Risk
- **Severity:** 🟠 High
- **Category:** A04:2025 Unrestricted Resource Consumption
- **Location:** `src/app/api/collect/replay/route.ts` → Lines 27-89
- **The Exploit Scenario:** Unlimited JSONB payload size. No PII scrubbing of DOM snapshots (may contain form inputs, credit card fields).
- **Impact:** Database storage exhaustion. PII stored without consent from tracked website visitors.
- **Remediation Strategy:** Max payload size (1MB), events array length limit, PII scrubbing for form inputs.

### [VULN-015] Mass Assignment in Site PATCH Endpoint
- **Severity:** 🟠 High
- **Category:** A01:2025 Broken Access Control
- **Location:** `src/app/api/sites/[siteId]/route.ts` → `PATCH()` → Lines 68-92
- **The Exploit Scenario:**
  1. The PATCH handler explicitly allows updating `is_public` and `api_access_enabled` via body params (lines 78-79).
  2. Combined with VULN-001 (no auth on /api/sites), an attacker can: `PATCH /api/sites/[siteId]` with `{"is_public": true}` to make any private site's analytics publicly accessible. Or set `{"api_access_enabled": true}` + use the stolen `server_api_key` (from GET /api/sites) to programmatically exfiltrate data.
  3. The `updates` object uses explicit field checking (not `...body`), but the allowed fields include security-sensitive flags.
- **Impact:** Attacker can convert private sites to public, enabling unauthenticated data access via /api/public/overview AND /share/[publicId].
- **Remediation Strategy:** Require authentication. Separate security-sensitive fields (is_public, api_access_enabled) from regular data updates.

---

## 🟡 Medium (5)

### [VULN-011] SSL Certificate Verification Disabled
- **Severity:** 🟡 Medium
- **Category:** A04:2025 Cryptographic Failures
- **Location:** `src/lib/db/index.ts` → Line 7
- **The Exploit Scenario:** `rejectUnauthorized: false` accepts any SSL cert including MITM certificates on DATABASE_URL connections.
- **Impact:** Database traffic susceptible to MITM interception on cloud deployments.
- **Remediation Strategy:** Use `rejectUnauthorized: true` in production with proper CA certificates.

### [VULN-012] No Security Headers (CSP, HSTS, X-Frame-Options)
- **Severity:** 🟡 Medium
- **Category:** A02:2025 Security Misconfiguration
- **Location:** `next.config.ts` → Lines 1-34
- **The Exploit Scenario:** No CSP, X-Frame-Options, HSTS, X-Content-Type-Options. Dashboard vulnerable to clickjacking, MIME sniffing, and downgrade attacks.
- **Impact:** Session cookies may be transmitted over HTTP. Dashboard embeddable in attacker iframes.
- **Remediation Strategy:** Add security headers in next.config.ts.

### [VULN-013] SSRF via Uptime URL Construction (Chain with VULN-001 + 003)
- **Severity:** 🟡 Medium (Critical when chained)
- **Category:** A01:2025 SSRF
- **Location:** `src/app/api/cron/uptime/route.ts` → Lines 16-27
- **The Exploit Scenario:** No domain validation. Combined with VULN-001 (create site with internal URL) + VULN-003 (trigger cron), enables SSRF to cloud metadata, internal services.
- **Impact:** Access to cloud metadata services, internal network scanning.
- **Remediation Strategy:** URL validation, deny private IP ranges, HTTPS-only.

### [VULN-016] Docker Compose Default Credentials
- **Severity:** 🟡 Medium
- **Category:** A02:2025 Security Misconfiguration
- **Location:** `docker-compose.yml` → Lines 18, 22, 35
- **The Exploit Scenario:** Default passwords `CHANGE_ME_db_password` and `CHANGE_ME_dashboard_password`. Users who don't change these run production systems with known credentials. PostgreSQL port is not explicitly restricted to the bridge network only (no `ports` mapping on the db service, which is good).
- **Impact:** Systems deployed with default passwords are immediately compromisable.
- **Remediation Strategy:** Remove default password values. Require env vars to be set explicitly. Add a startup validation check.

### [VULN-017] `select()` Over-Fetching in Multiple Routes
- **Severity:** 🟡 Medium
- **Category:** A03:2025 Insecure Design / Data Exposure
- **Location:** `src/app/api/sites/route.ts` → Line 14 (GET returns `select()` = all columns including `api_key`, `server_api_key`), `src/app/api/cron/uptime/route.ts` → Line 13 (`select()` from sites = all columns), `src/app/api/dashboard/banned-logins/route.ts` → Line 14 (`select()` from bannedLogins = all columns)
- **The Exploit Scenario:** Multiple routes use `db.select().from(table)` without specifying columns, returning ALL columns including sensitive fields (api_key, server_api_key, IP addresses). Even if auth were fixed, over-fetching in API responses exposes more data than the UI needs.
- **Impact:** API responses contain sensitive fields not required by the UI. API key exposure even in authenticated contexts.
- **Remediation Strategy:** Always specify columns in select. Never return api_key/server_api_key in list views. Use dedicated response DTOs.

---

## 🔵 Low (2)

### [VULN-014] IP-Hashing Salt Partially Predictable
- **Severity:** 🔵 Low
- **Category:** A04:2025 Cryptographic Failures
- **Location:** `src/app/api/collect/route.ts` → `getDailySalt()` → Lines 18-28
- **The Exploit Scenario:** Salt = `sha256(today + "-wa-pro-salt-" + NODE_ENV)`. Date and NODE_ENV are known — salt is precomputable for IP de-anonymization.
- **Impact:** Theoretical visitor de-anonymization if attacker accesses ip_hash values.
- **Remediation Strategy:** Add a cryptographically random server-side secret to the salt.

### [VULN-018] No Rate Limiting on Dashboard API Routes
- **Severity:** 🔵 Low
- **Category:** A04:2025 Unrestricted Resource Consumption
- **Location:** All `src/app/api/dashboard/*/route.ts` routes
- **The Exploit Scenario:** Dashboard API routes execute complex aggregation queries (retained cohorts, time series, funnels). An authenticated attacker (or an attacker who steals a session token) can issue rapid queries to overload the database.
- **Impact:** Database performance degradation, potential denial of service for legitimate dashboard usage.
- **Remediation Strategy:** Add per-session rate limiting on dashboard API routes. Consider query result caching.
