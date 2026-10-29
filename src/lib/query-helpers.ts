// ============================================================
// Xine — Shared Query Helpers
// Centralized, validated helpers used by queries.ts,
// queries-advanced.ts, the dashboard routes and the MCP tools.
// Keeps raw SQL patterns in a single auditable location so that
// every report agrees on what a "day", a "source", a "page" and a
// "duration" mean.
// ============================================================

import { sql, type SQL } from "drizzle-orm";
import type { AnyColumn, Column } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { differenceInDays } from "date-fns";
import { pageviews, events, sessions } from "./db/schema";
import type { DateRange } from "./types";
import type { DimensionFilters } from "./api-helpers";

type SqlOperand = AnyColumn | SQL;

// ============================================================
// DURATION
// ============================================================

/**
 * One duration definition for every report (dashboard, MCP, public API,
 * email reports):
 *
 *  - Time on page   = AVG(LEAST(pageviews.duration, 30 min))
 *  - Visit duration = AVG(LEAST(sessions.total_duration, 4 h))
 *
 * The tracker reports engaged (foreground) seconds and the collector clamps
 * them, but rows written by older t.js builds contain wall-clock time for
 * tabs left open for days (one stored row is 25 days long). Capping at query
 * time keeps those historical outliers from dominating every average.
 */
export const MAX_PAGE_DURATION_SEC = 1800;
export const MAX_SESSION_DURATION_SEC = 4 * 3600;

/** Per-row page duration, capped. Use inside AVG/SUM. */
export function cappedPageDuration(column: SqlOperand): SQL<number> {
  return sql<number>`LEAST(COALESCE(${column}, 0), ${sql.raw(String(MAX_PAGE_DURATION_SEC))})`;
}

/** Per-row session duration, capped. Use inside AVG/SUM. */
export function cappedSessionDuration(column: SqlOperand): SQL<number> {
  return sql<number>`LEAST(COALESCE(${column}, 0), ${sql.raw(String(MAX_SESSION_DURATION_SEC))})`;
}

// ============================================================
// TIMEZONE
// ============================================================

const tzCache = new Map<string, boolean>();

/**
 * Validate an IANA timezone name and return it, or "UTC" when absent/invalid.
 *
 * The result is inlined into SQL as a literal (see tzLiteral), so validation
 * is strict: a conservative character whitelist first (no quotes, spaces or
 * backslashes can ever pass), then the runtime's own tz database via Intl.
 */
export function normalizeTimeZone(tz?: string | null): string {
  if (!tz) return "UTC";
  const value = tz.trim();
  if (!value || value.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return "UTC";

  const cached = tzCache.get(value);
  if (cached !== undefined) return cached ? value : "UTC";

  let valid = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    valid = true;
  } catch {
    valid = false;
  }
  if (tzCache.size < 1000) tzCache.set(value, valid);
  return valid ? value : "UTC";
}

/**
 * The range's timezone as an inlined SQL string literal.
 *
 * Inlined (sql.raw) rather than bound for the same reason buildDateExpr
 * inlines its bucket: Postgres needs byte-identical expression text in
 * SELECT and GROUP BY, and a bound parameter gets a different $n slot at
 * each reference. Safe because normalizeTimeZone only ever returns a
 * whitelisted, Intl-validated zone name.
 */
export function tzLiteral(dateRange?: Pick<DateRange, "tz"> | null): SQL {
  return sql.raw(`'${normalizeTimeZone(dateRange?.tz)}'`);
}

/** `column AT TIME ZONE tz` — the wall-clock time in the report timezone. */
export function localTimestamp(column: SqlOperand, dateRange?: Pick<DateRange, "tz"> | null): SQL {
  return sql`(${column} AT TIME ZONE ${tzLiteral(dateRange)})`;
}

/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffsetMs(instantMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, number> = {};
  for (const p of dtf.formatToParts(new Date(instantMs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const wholeSecond = instantMs - (((instantMs % 1000) + 1000) % 1000);
  return asUtc - wholeSecond;
}

/**
 * The UTC instant of local midnight on the given calendar day in `tz`.
 * Day overflow is allowed (day + 1 on the 31st rolls into next month).
 */
export function zonedMidnightToUtc(year: number, month: number, day: number, tz: string): Date {
  const zone = normalizeTimeZone(tz);
  const guess = Date.UTC(year, month - 1, day);
  const offset = tzOffsetMs(guess, zone);
  let result = guess - offset;
  // Re-check at the candidate instant: on DST-change days the offset at
  // UTC midnight can differ from the offset at local midnight.
  const offset2 = tzOffsetMs(result, zone);
  if (offset2 !== offset) result = guess - offset2;
  return new Date(result);
}

/** Calendar parts (year, month 1-12, day) of an instant as seen in `tz`. */
export function zonedDateParts(instant: Date, tz: string): { year: number; month: number; day: number; weekday: number } {
  const zone = normalizeTimeZone(tz);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(instant)) parts[p.type] = p.value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdays.indexOf(parts.weekday),
  };
}

/** Local midnight (as a UTC instant) of the day containing `instant` in `tz`. */
export function startOfZonedDay(instant: Date, tz: string): Date {
  const { year, month, day } = zonedDateParts(instant, tz);
  return zonedMidnightToUtc(year, month, day, tz);
}

// ============================================================
// DATE RANGES & BUCKETS
// ============================================================

/**
 * The comparison window for "% change vs previous period".
 *
 * Measured in exact milliseconds (differenceInDays truncated, so "Last 1h"
 * got a zero-width baseline and always showed +100%, and a 7-day range was
 * compared with 6 days). `to` is clamped to now first: day presets end at
 * the end of today, and the not-yet-happened part must not lengthen the
 * baseline. The baseline ends 1 ms before `from` so a row exactly on the
 * boundary is never counted in both windows (range filters use lte(to)).
 */
export function getPreviousDateRange(dateRange: DateRange): DateRange {
  const fromMs = dateRange.from.getTime();
  const effectiveTo = Math.min(dateRange.to.getTime(), Date.now());
  // Both bounds are inclusive (gte/lte), so the window holds span + 1 ms.
  const span = Math.max(effectiveTo - fromMs + 1, 0);
  return {
    from: new Date(fromMs - span),
    to: new Date(fromMs - 1),
    tz: dateRange.tz,
  };
}

/**
 * Supported time-bucket intervals for timeseries queries.
 * This is a closed set — only these values are ever inlined
 * into SQL via sql.raw(), guaranteeing injection safety.
 */
type TimeBucket = "hour" | "day";

/** PostgreSQL to_char format strings mapped to each bucket. */
const BUCKET_FORMATS: Record<TimeBucket, string> = {
  hour: "YYYY-MM-DD HH24:00",
  day: "YYYY-MM-DD",
};

/**
 * Determines the appropriate time bucket for a date range.
 *  - Ranges ≤ 2 days  → hourly buckets
 *  - Ranges > 2 days  → daily  buckets
 */
export function getTimeBucket(dateRange: DateRange): TimeBucket {
  const daysDiff = differenceInDays(dateRange.to, dateRange.from);
  return daysDiff <= 2 ? "hour" : "day";
}

/**
 * Builds a deterministic SQL date expression for timeseries grouping.
 *
 * Buckets are computed on the wall-clock time in the range's timezone
 * (`column AT TIME ZONE tz`), so a "day" is the viewer's day rather than the
 * database session's UTC day — otherwise 7-8 hours of every Pacific-time
 * day (the zone GSC reports in) land on the neighbouring Xine day.
 *
 * Uses `sql.raw()` to inline the bucket interval, format string and
 * timezone as SQL literals (not parameterized values). This is critical
 * because PostgreSQL requires the exact same expression text in SELECT,
 * GROUP BY, and ORDER BY clauses — parameterized values get different
 * slot numbers ($1 vs $6) on each reference, causing GROUP BY mismatches.
 *
 * Safety: `bucket` is derived from `getTimeBucket()` which returns
 * only `"hour"` or `"day"`. `format` is looked up from the frozen
 * `BUCKET_FORMATS` map. The timezone goes through normalizeTimeZone().
 * None of them is ever inlined unvalidated.
 *
 * @param dateRange - The selected date range (determines bucket size and tz)
 * @param column    - The timestamp column to bucket (e.g. pageviews.created_at)
 * @returns A reusable SQL<string> expression safe for select/groupBy/orderBy
 *
 * @example
 * ```ts
 * const dateExpr = buildDateExpr(dateRange, pageviews.created_at);
 * const rows = await db
 *   .select({ date: dateExpr, count: sql<number>`COUNT(*)::int` })
 *   .from(pageviews)
 *   .where(...)
 *   .groupBy(dateExpr)
 *   .orderBy(dateExpr);
 * ```
 */
export function buildDateExpr(
  dateRange: DateRange,
  column: Column | SQL,
  bucketOverride?: TimeBucket
): SQL<string> {
  const bucket = bucketOverride ?? getTimeBucket(dateRange);
  const format = BUCKET_FORMATS[bucket];

  return sql<string>`to_char(DATE_TRUNC(${sql.raw(`'${bucket}'`)}, ${localTimestamp(column, dateRange)}), ${sql.raw(`'${format}'`)})`;
}

// ============================================================
// SITE SCOPE
// ============================================================

/**
 * `col = siteId` / `col IN (...)` / no-op for "all" / `false` for an empty
 * list. Dashboard routes resolve "all" to the caller's site-id array, so an
 * array must never be interpolated as a scalar (`col = ($1, $2)` is a
 * uuid = record error in Postgres).
 */
export function siteScopeSql(column: SqlOperand, siteId: string | string[]): SQL {
  if (Array.isArray(siteId)) {
    if (siteId.length === 0) return sql`false`;
    return sql`${column} IN (${sql.join(siteId.map((id) => sql`${id}::uuid`), sql`, `)})`;
  }
  if (siteId === "all") return sql`true`;
  return sql`${column} = ${siteId}::uuid`;
}

// ============================================================
// PAGES
// ============================================================

/**
 * Page path without query string or fragment.
 *
 * pageviews.url / sessions.entry_page store `pathname + search`, so one page
 * splits into a row per query-string variant (utm_*, fbclid, gclid, search
 * params…), pushing real pages out of a top-10. Reports group by the path,
 * which is also how GSC keys pages. Case and trailing slash are preserved:
 * paths are case-sensitive and GSC treats them as distinct URLs.
 */
export function pagePathSql(column: SqlOperand): SQL<string> {
  return sql<string>`split_part(split_part(COALESCE(${column}, ''), '?', 1), '#', 1)`;
}

/** Normalise a user-supplied page filter value to the same path form. */
export function normalizePagePath(value: string): string {
  let v = value.trim();
  const schemeMatch = /^[a-z][a-z0-9+.-]*:\/\/[^/]*/i.exec(v);
  if (schemeMatch) v = v.slice(schemeMatch[0].length) || "/";
  return v.split("#")[0].split("?")[0];
}

// ============================================================
// TRAFFIC SOURCE CLASSIFIER
// ============================================================

/**
 * One rule per known source, matched against the referrer host
 * (lower-cased, leading "www." stripped; for android-app:// referrers the
 * package name):
 *  - `exact`  — host equals one of these
 *  - `suffix` — host is the domain or any subdomain of it
 *  - `regex`  — for the few families that need it (Google/Yandex ccTLDs)
 *  - `utm`    — bare utm_source names (utm_source=google); a utm_source
 *               that looks like a host (chatgpt.com) is also run through
 *               the host rules, so tagged and untagged visits share a row.
 *
 * Order matters: the first match wins, so AI assistants and mail on
 * google.com come before Google search.
 *
 * Plain equality/LIKE is used wherever possible on purpose: Postgres caches
 * only ~32 compiled regexes per backend, and a classifier with one regex per
 * rule would recompile on every row. Every value here is a constant inlined
 * with sql.raw — never user input.
 */
interface SourceRule {
  name: string;
  channel: "search" | "ai" | "social" | "email";
  exact?: string[];
  suffix?: string[];
  regex?: string;
  utm?: string[];
}

const SOURCE_RULES: SourceRule[] = [
  // ---- AI assistants (before Google: gemini.google.com is not search) ----
  { name: "ChatGPT", channel: "ai", exact: ["chat.openai.com", "com.openai.chatgpt"], suffix: ["chatgpt.com"], utm: ["chatgpt", "openai"] },
  { name: "Perplexity", channel: "ai", suffix: ["perplexity.ai"], utm: ["perplexity"] },
  { name: "Gemini", channel: "ai", exact: ["gemini.google.com", "bard.google.com", "vertexaisearch.cloud.google.com", "com.google.android.apps.bard"], utm: ["gemini", "bard"] },
  { name: "Copilot", channel: "ai", exact: ["copilot.microsoft.com", "copilot.cloud.microsoft", "m365.cloud.microsoft"], suffix: ["copilot.com"], utm: ["copilot"] },
  { name: "Claude", channel: "ai", exact: ["claude.ai"], utm: ["claude"] },
  { name: "DeepSeek", channel: "ai", suffix: ["deepseek.com"], utm: ["deepseek"] },

  // ---- Email clients (before Google/Yahoo: mail.* is not search) ----
  { name: "Gmail", channel: "email", exact: ["mail.google.com", "inbox.google.com", "com.google.android.gm"], utm: ["gmail"] },
  { name: "Outlook", channel: "email", exact: ["outlook.live.com", "outlook.office.com", "outlook.office365.com", "outlook.cloud.microsoft"], utm: ["outlook"] },
  { name: "Yahoo Mail", channel: "email", suffix: ["mail.yahoo.com", "mail.yahoo.co.jp"] },

  // ---- Search engines ----
  // google.com, google.de, google.co.uk, google.com.hk … plus the Google app.
  { name: "Google", channel: "search", exact: ["com.google.android.googlequicksearchbox"], regex: String.raw`^google\.[a-z]{2,3}(\.[a-z]{2})?$`, utm: ["google"] },
  // Includes cn.bing.com, global/www4/akam.bing.com and s.cn.bing.net — Bing
  // Webmaster Tools counts Bing China clicks, so they stay in "Bing". The raw
  // host is still exposed (referrerHostSql) for drill-downs.
  { name: "Bing", channel: "search", exact: ["bing.com.cn"], suffix: ["bing.com", "bing.net"], utm: ["bing"] },
  { name: "Yahoo", channel: "search", exact: ["yahoo.co.jp"], suffix: ["search.yahoo.com", "search.yahoo.co.jp"], utm: ["yahoo"] },
  { name: "DuckDuckGo", channel: "search", exact: ["ddg.gg"], suffix: ["duckduckgo.com"], regex: String.raw`^duckduckgo[a-z0-9]*\.onion$`, utm: ["duckduckgo", "ddg"] },
  { name: "Ecosia", channel: "search", suffix: ["ecosia.org"], utm: ["ecosia"] },
  { name: "Baidu", channel: "search", suffix: ["baidu.com"], utm: ["baidu"] },
  { name: "Sogou", channel: "search", suffix: ["sogou.com"], utm: ["sogou"] },
  { name: "Yandex", channel: "search", exact: ["ya.ru"], regex: String.raw`(^|\.)yandex\.[a-z]{2,3}(\.[a-z]{2})?$`, utm: ["yandex"] },
  { name: "Naver", channel: "search", suffix: ["naver.com"], utm: ["naver"] },
  { name: "Brave", channel: "search", exact: ["search.brave.com"], utm: ["brave"] },
  { name: "Startpage", channel: "search", suffix: ["startpage.com", "startpage.nl"], utm: ["startpage"] },
  { name: "Qwant", channel: "search", suffix: ["qwant.com", "qwantjunior.com"], utm: ["qwant"] },
  { name: "Seznam", channel: "search", exact: ["seznam.cz", "search.seznam.cz"], utm: ["seznam"] },
  { name: "AOL", channel: "search", exact: ["search.aol.com", "search.aol.co.uk"], utm: ["aol"] },

  // ---- Social ----
  { name: "Facebook", channel: "social", exact: ["fb.me", "com.facebook.katana", "com.facebook.orca", "com.facebook.lite"], suffix: ["facebook.com", "fb.com"], utm: ["facebook", "fb"] },
  { name: "Instagram", channel: "social", exact: ["com.instagram.android"], suffix: ["instagram.com"], utm: ["instagram", "ig"] },
  { name: "X (Twitter)", channel: "social", exact: ["t.co", "com.twitter.android"], suffix: ["twitter.com", "x.com"], utm: ["twitter", "x"] },
  { name: "LinkedIn", channel: "social", exact: ["lnkd.in", "com.linkedin.android"], suffix: ["linkedin.com"], utm: ["linkedin"] },
  { name: "Reddit", channel: "social", exact: ["redd.it", "com.reddit.frontpage"], suffix: ["reddit.com"], utm: ["reddit"] },
  { name: "YouTube", channel: "social", exact: ["youtu.be", "com.google.android.youtube"], suffix: ["youtube.com"], utm: ["youtube"] },
  { name: "Pinterest", channel: "social", exact: ["pin.it"], regex: String.raw`(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$`, utm: ["pinterest"] },
  { name: "TikTok", channel: "social", suffix: ["tiktok.com"], utm: ["tiktok"] },
  { name: "Threads", channel: "social", suffix: ["threads.net", "threads.com"], utm: ["threads"] },
  { name: "Bluesky", channel: "social", exact: ["bsky.app"], utm: ["bluesky", "bsky"] },
  { name: "Hacker News", channel: "social", exact: ["news.ycombinator.com"], utm: ["hackernews", "hn"] },
  { name: "Telegram", channel: "social", exact: ["t.me", "org.telegram.messenger"], suffix: ["telegram.org"], utm: ["telegram"] },
  { name: "WhatsApp", channel: "social", exact: ["wa.me", "com.whatsapp"], suffix: ["whatsapp.com"], utm: ["whatsapp"] },
  { name: "Discord", channel: "social", suffix: ["discord.com", "discordapp.com"], utm: ["discord"] },
  { name: "Quora", channel: "social", suffix: ["quora.com"], utm: ["quora"] },
];

/** utm_medium values that mark a paid click. */
const PAID_MEDIUM_RE = String.raw`^(cpc|ppc|cpm|cpv|cpa|paid.*|paidsearch|paid_search|sem|display|retargeting)$`;
/** Google Ads / Bing Ads click ids on the landing URL (older t.js builds did not translate them to UTMs). */
const GOOGLE_CLICK_ID_RE = String.raw`[?&](gclid|gbraid|wbraid|dclid)=`;
const BING_CLICK_ID_RE = String.raw`[?&]msclkid=`;

/** Inline a constant from this file as a SQL string literal. */
function lit(value: string): SQL {
  // Constants only (defined above). Guard anyway: a quote would break out
  // of the literal.
  if (value.includes("'")) throw new Error("Invalid classifier constant");
  return sql.raw(`'${value}'`);
}

/** SQL predicate: `hostExpr` matches rule `r`. */
function ruleMatch(hostExpr: SQL, r: SourceRule): SQL {
  const parts: SQL[] = [];
  if (r.exact?.length) parts.push(sql`${hostExpr} IN (${sql.join(r.exact.map(lit), sql`, `)})`);
  for (const d of r.suffix ?? []) {
    parts.push(sql`${hostExpr} = ${lit(d)} OR ${hostExpr} LIKE ${lit(`%.${d}`)}`);
  }
  if (r.regex) parts.push(sql`${hostExpr} ~ ${lit(r.regex)}`);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

/**
 * Referrer host: lower-cased, "www." stripped, port/path/query dropped.
 * For `android-app://com.google.android.googlequicksearchbox/` this yields
 * the package name. NULL when the referrer is empty or not a URL.
 */
export function referrerHostSql(referrer: SqlOperand): SQL<string> {
  return sql<string>`regexp_replace(lower(substring(${referrer} from '^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)')), '^www\\.', '')`;
}

export interface SourceColumns {
  referrer: SqlOperand;
  utmSource: SqlOperand;
  utmMedium: SqlOperand;
  /** Landing URL (pathname + search) — checked for gclid/msclkid. */
  url: SqlOperand;
  /** site_id column, used to detect self-referrals. */
  siteId: SqlOperand;
}

export interface SourceClassifier {
  /** Raw referrer host (for drill-downs), NULL for direct. */
  host: SQL<string>;
  /** Normalised source name: "Google", "Bing", "Direct", "example.com", "Google (paid)" … */
  name: SQL<string>;
  /** search | paid | ai | social | email | referral | direct | internal */
  channel: SQL<string>;
  /** true for organic search only (paid search excluded). */
  isOrganicSearch: SQL<boolean>;
  /**
   * true for paid clicks whose underlying source is a search engine
   * (Google/Bing Ads click ids, or utm_medium=cpc on a search referrer or
   * search utm_source). Paid social/display is not included.
   */
  isPaidSearch: SQL<boolean>;
}

/**
 * The single traffic-source classifier used by every report.
 *
 * Precedence (GA4-like):
 *  1. utm_source, when present, names the source (mapped through the same
 *     rules, so utm_source=google and a google.* referrer share a row).
 *  2. Google/Bing Ads click ids on the landing URL → Google / Bing (paid).
 *  3. No referrer → Direct.
 *  4. Referrer host against SOURCE_RULES (host-anchored, never the path or
 *     query, so `bing.com/search?q=google.com` is Bing, not Google).
 *  5. Self-referral (the site's own domain or a subdomain) → Direct with
 *     channel "internal": it is never reported as a traffic source.
 *  6. Anything else → the host itself, channel "referral".
 *
 * utm_medium cpc/ppc/paid* or a click id makes the channel "paid" and adds a
 * " (paid)" suffix to the name, so paid clicks never count as organic SEO
 * and never merge into the organic row.
 *
 * Each expression is a correlated scalar subquery over a one-row derived
 * table. The `OFFSET 0` fences it from subquery pull-up, so the host regex
 * is evaluated once per row instead of once per CASE branch. The
 * expressions contain only columns and inlined constants (no bound
 * parameters), so they can be repeated verbatim in SELECT and GROUP BY.
 */
export function classifySource(cols: SourceColumns): SourceClassifier {
  const inputs = sql`(SELECT
      ${referrerHostSql(cols.referrer)} AS h,
      lower(trim(COALESCE(${cols.utmSource}, ''))) AS u,
      regexp_replace(lower(trim(COALESCE(${cols.utmSource}, ''))), '^www\\.', '') AS uh,
      lower(trim(COALESCE(${cols.utmMedium}, ''))) AS m,
      trim(COALESCE(${cols.referrer}, '')) AS r,
      COALESCE(${cols.url}, '') AS l,
      ${cols.siteId} AS sid
    OFFSET 0) z`;

  const h = sql.raw("z.h");
  const u = sql.raw("z.u");
  const uh = sql.raw("z.uh");
  const googleClick = sql`z.l ~* ${lit(GOOGLE_CLICK_ID_RE)}`;
  const bingClick = sql`z.l ~* ${lit(BING_CLICK_ID_RE)}`;
  const isPaid = sql`(z.m ~ ${lit(PAID_MEDIUM_RE)} OR (z.u = '' AND (${googleClick} OR ${bingClick})))`;
  const domain = sql`(SELECT regexp_replace(regexp_replace(lower(xs.domain), '^[a-z][a-z0-9+.-]*://', ''), '^www\\.|[:/].*$', '', 'g') FROM sites xs WHERE xs.id = z.sid)`;
  const isSelf = sql`(z.h = ${domain} OR z.h LIKE '%.' || ${domain})`;

  const utmMatch = (r: SourceRule) =>
    r.utm?.length ? sql`(${u} IN (${sql.join(r.utm.map(lit), sql`, `)}) OR ${ruleMatch(uh, r)})` : ruleMatch(uh, r);

  const utmNameCases = sql.join(SOURCE_RULES.map((r) => sql`WHEN ${utmMatch(r)} THEN ${lit(r.name)}`), sql` `);
  const hostNameCases = sql.join(SOURCE_RULES.map((r) => sql`WHEN ${ruleMatch(h, r)} THEN ${lit(r.name)}`), sql` `);
  const utmChannelCases = sql.join(SOURCE_RULES.map((r) => sql`WHEN ${utmMatch(r)} THEN ${lit(r.channel)}`), sql` `);
  const hostChannelCases = sql.join(SOURCE_RULES.map((r) => sql`WHEN ${ruleMatch(h, r)} THEN ${lit(r.channel)}`), sql` `);

  const name = sql<string>`(SELECT
    (CASE
      WHEN z.u <> '' THEN (CASE ${utmNameCases} ELSE z.u END)
      WHEN ${googleClick} THEN 'Google'
      WHEN ${bingClick} THEN 'Bing'
      WHEN z.r = '' THEN 'Direct'
      ${hostNameCases}
      WHEN z.h IS NULL THEN lower(z.r)
      WHEN ${isSelf} THEN 'Direct'
      ELSE z.h
    END) || (CASE WHEN ${isPaid} THEN ' (paid)' ELSE '' END)
    FROM ${inputs})`;

  const channel = sql<string>`(SELECT CASE
      WHEN ${isPaid} THEN 'paid'
      WHEN z.u <> '' THEN (CASE
        WHEN z.m ~ '^(e-?mail|newsletter)$' THEN 'email'
        WHEN z.m ~ '^(social|social-network|social-media|sm)$' THEN 'social'
        ${utmChannelCases}
        ELSE 'referral' END)
      WHEN z.r = '' THEN 'direct'
      ${hostChannelCases}
      WHEN z.h IS NULL THEN 'referral'
      WHEN ${isSelf} THEN 'internal'
      ELSE 'referral'
    END
    FROM ${inputs})`;

  // The channel the visit would have had without the paid override, used to
  // tell paid search (Google Ads, Microsoft Ads) apart from paid social or
  // display: channel is just "paid" for all of them.
  const unpaidChannel = sql`(CASE
      WHEN z.u <> '' THEN (CASE ${utmChannelCases} ELSE 'other' END)
      WHEN ${googleClick} OR ${bingClick} THEN 'search'
      ELSE (CASE ${hostChannelCases} ELSE 'other' END)
    END)`;
  const isPaidSearch = sql<boolean>`(SELECT ${isPaid} AND ${unpaidChannel} = 'search' FROM ${inputs})`;

  return {
    host: referrerHostSql(cols.referrer),
    name,
    channel,
    isOrganicSearch: sql<boolean>`(${channel} = 'search')`,
    isPaidSearch,
  };
}

/** Classifier bound to the sessions table (entry referrer + first-touch UTMs). */
export function sessionSourceClassifier(table: typeof sessions = sessions): SourceClassifier {
  return classifySource({
    referrer: table.referrer,
    utmSource: table.utm_source,
    utmMedium: table.utm_medium,
    url: table.entry_page,
    siteId: table.site_id,
  });
}

/** Classifier bound to the pageviews table. */
export function pageviewSourceClassifier(table: typeof pageviews = pageviews): SourceClassifier {
  return classifySource({
    referrer: table.referrer,
    utmSource: table.utm_source,
    utmMedium: table.utm_medium,
    url: table.url,
    siteId: table.site_id,
  });
}

/**
 * Normalise a user-supplied "sources" filter value for host comparison:
 * "https://www.Google.com/" → "google.com". Source names ("Google") are
 * compared case-insensitively against the classified name.
 */
function normalizeSourceFilterHost(value: string): string {
  let v = value.trim().toLowerCase();
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  v = v.split(/[/?#:]/)[0];
  return v.replace(/^www\./, "");
}

// ============================================================
// DIMENSION FILTERS
// ============================================================

/**
 * Filter semantics (identical on every page, MCP tool and API):
 *
 *  - countries / browsers / devices — row-level on the queried table when it
 *    has the column; for events (no such columns) via the event's session.
 *  - sources — session-level: the session's entry source as classified by
 *    classifySource (so "Google" matches every Google ccTLD and the Google
 *    app). Raw hosts ("google.com", "www.google.com") are accepted too.
 *  - pages — session-level: sessions that VIEWED the page (path, query
 *    string ignored). Pageview reports then cover whole matching visits, so
 *    the overview's bounce rate and pages/visit are computed over complete
 *    sessions instead of only the pageviews that happen to match.
 *
 * Session-level filters on pageviews/events become
 * `session_id IN (SELECT id FROM sessions …)`; the subquery is bounded to
 * sessions that started up to a day before the range so it stays on the
 * (site_id, started_at) index.
 */
const SESSION_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type FilterTable = typeof pageviews | typeof events | typeof sessions;

function deviceCondition(deviceCol: SqlOperand, devices: string[]): SQL {
  const list = devices.map((d) => d.toLowerCase());
  const known = sql`LOWER(COALESCE(${deviceCol}, '')) IN ('mobile', 'tablet')`;
  const parts: SQL[] = [];
  const explicit = list.filter((d) => d !== "desktop");
  if (explicit.length > 0) {
    parts.push(sql`LOWER(${deviceCol}) IN (${sql.join(explicit.map((d) => sql`${d}`), sql`, `)})`);
  }
  // "desktop" is everything that is not mobile/tablet — the same folding the
  // device breakdown uses (NULL, '' and unrecognised values included).
  if (list.includes("desktop")) parts.push(sql`NOT (${known})`);
  return parts.length > 0 ? sql`(${sql.join(parts, sql` OR `)})` : sql`false`;
}

export function buildDimensionConditions(
  table: FilterTable,
  siteId: string | string[],
  dateRange: DateRange,
  filters?: DimensionFilters
): SQL[] {
  const conditions: SQL[] = [];
  if (!filters) return conditions;

  const isSessions = table === sessions;
  const sessionLevel: SQL[] = [];
  const s2 = alias(sessions, "fs2");

  const rowOrSession = (
    key: "country" | "browser" | "device",
    build: (col: SqlOperand) => SQL
  ) => {
    if (key in table) {
      conditions.push(build((table as unknown as Record<string, AnyColumn>)[key]));
    } else {
      sessionLevel.push(build(s2[key]));
    }
  };

  if (filters.countries && filters.countries.length > 0) {
    const list = filters.countries;
    rowOrSession("country", (col) => sql`${col} IN (${sql.join(list.map((c) => sql`${c}`), sql`, `)})`);
  }
  if (filters.browsers && filters.browsers.length > 0) {
    const list = filters.browsers;
    rowOrSession("browser", (col) => sql`${col} IN (${sql.join(list.map((b) => sql`${b}`), sql`, `)})`);
  }
  if (filters.devices && filters.devices.length > 0) {
    const list = filters.devices;
    rowOrSession("device", (col) => deviceCondition(col, list));
  }

  if (filters.sources && filters.sources.length > 0) {
    const names = filters.sources.map((s) => s.trim().toLowerCase()).filter(Boolean);
    const hosts = filters.sources.map(normalizeSourceFilterHost).filter(Boolean);
    const target = isSessions ? sessions : s2;
    const cls = sessionSourceClassifier(target as typeof sessions);
    // Values that normalise to nothing (e.g. [""] from an MCP client) must
    // not render an empty `IN ()`, which is a syntax error.
    const matchers: SQL[] = [];
    if (names.length > 0) matchers.push(sql`lower(${cls.name}) IN (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`);
    if (hosts.length > 0) matchers.push(sql`${cls.host} IN (${sql.join(hosts.map((h) => sql`${h}`), sql`, `)})`);
    const cond = matchers.length > 0 ? sql`(${sql.join(matchers, sql` OR `)})` : sql`false`;
    if (isSessions) conditions.push(cond);
    else sessionLevel.push(cond);
  }

  if (filters.pages && filters.pages.length > 0) {
    const paths = Array.from(new Set(filters.pages.map(normalizePagePath).filter(Boolean)));
    if (paths.length === 0) {
      // Every value normalised to "" (e.g. "?x"): match nothing rather than
      // render an empty `IN ()`.
      conditions.push(sql`false`);
      return conditions;
    }
    const p2 = alias(pageviews, "fp2");
    const lookbackFrom = new Date(dateRange.from.getTime() - SESSION_LOOKBACK_MS);
    const viewedPage = sql`SELECT ${p2.session_id} FROM ${pageviews} AS ${p2}
      WHERE ${siteScopeSql(p2.site_id, siteId)}
        AND ${p2.created_at} >= ${lookbackFrom}
        AND ${p2.created_at} <= ${dateRange.to}
        AND ${pagePathSql(p2.url)} IN (${sql.join(paths.map((p) => sql`${p}`), sql`, `)})`;
    const sessionIdCol = isSessions ? sessions.id : (table as typeof pageviews | typeof events).session_id;
    conditions.push(sql`${sessionIdCol} IN (${viewedPage})`);
  }

  if (sessionLevel.length > 0) {
    const lookbackFrom = new Date(dateRange.from.getTime() - SESSION_LOOKBACK_MS);
    const sessionIdCol = (table as typeof pageviews | typeof events).session_id;
    conditions.push(sql`${sessionIdCol} IN (
      SELECT ${s2.id} FROM ${sessions} AS ${s2}
      WHERE ${siteScopeSql(s2.site_id, siteId)}
        AND ${s2.started_at} >= ${lookbackFrom}
        AND ${s2.started_at} <= ${dateRange.to}
        AND ${sql.join(sessionLevel, sql` AND `)}
    )`);
  }

  return conditions;
}
