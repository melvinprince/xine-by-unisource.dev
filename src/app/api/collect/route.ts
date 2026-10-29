import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { sites, pageviews, events, sessions, goalConversions } from "@/lib/db/schema";
import { eq, and, desc, gte, inArray, sql } from "drizzle-orm";
import { getCachedGoals } from "@/lib/goals-cache";
import { createHash, randomUUID } from "crypto";
import {
  detectBot,
  encodeBotReason,
  hostMatchesDomain,
  inheritSessionVerdict,
  type BotVerdict,
} from "@/lib/bot-detection";
import { getClientIp } from "@/lib/client-ip";
import {
  getCachedSite,
  setCachedSite,
  setCachedInvalid,
} from "@/lib/api-key-cache";

// ---- Daily-rotating salt for IP hashing ----
// Keyed by UTC date. Today's and yesterday's salts are both kept because a
// visit that spans 00:00 UTC has to be matched against the session it began
// under the previous salt (see computeVisitorIds).
const saltCache = new Map<string, string>();

function saltForDate(day: string): string {
  let salt = saltCache.get(day);
  if (!salt) {
    // VULN-014 FIX: Include server-side secret in salt to prevent precomputation
    const serverSecret = process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "";
    salt = createHash("sha256")
      .update(day + "-wa-pro-salt-" + serverSecret + "-" + process.env.NODE_ENV)
      .digest("hex")
      .slice(0, 16);
    if (saltCache.size >= 4) saltCache.clear();
    saltCache.set(day, salt);
  }
  return salt;
}

function utcDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function getDailySalt(): string {
  return saltForDate(utcDay());
}

function hashIp(ip: string): string {
  if (!ip) return "";
  return createHash("sha256")
    .update(ip + getDailySalt())
    .digest("hex")
    .slice(0, 16);
}

/**
 * Cookieless visitor identity: IP + User-Agent + daily salt.
 *
 * The User-Agent is part of the hash because IP alone collapses everyone
 * behind a NAT (CGNAT, offices, schools, mobile carriers) into a single
 * "visitor" whose sessions then merge into one. Including the UA separates
 * distinct devices/browsers sharing an egress IP, which is the dominant
 * source of visitor undercounting.
 */
function computeVisitorId(ip: string, userAgent: string, salt = getDailySalt()): string {
  if (!ip && !userAgent) return "";
  return createHash("sha256")
    .update(ip + "|" + userAgent + "|" + salt)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Today's visitor id plus the one the same person had under yesterday's salt.
 *
 * Only the first is ever written for a new visit, so multi-day uniqueness is
 * unchanged (one person on N days is still N daily visitors). The second is
 * used solely to find a session that is still active across 00:00 UTC, which
 * previously split into two sessions with the second starting as a bounce.
 */
function computeVisitorIds(ip: string, userAgent: string): string[] {
  const today = computeVisitorId(ip, userAgent);
  if (!today) return [];
  return [today, computeVisitorId(ip, userAgent, saltForDate(utcDay(-1)))];
}

// ---- Request-rate ceilings (per client IP, 1-minute fixed window) ----
//
// Two tiers, because the old single 100/min ceiling silently deleted real
// people: a NAT'd office shares one IP, and each pageview legitimately emits
// a pageview beacon plus up to three heartbeats plus unload durations plus
// scroll/click events.
//
//  - SOFT: adds a weighted signal only. On its own it can never flag a
//    visitor; it has to coincide with other anomalies.
//  - HARD: the one and only place this endpoint discards data. It is a
//    database-protection backstop, not a bot judgement, and is set far above
//    anything a shared egress IP produces for one site (10k/min is ~167 req/s
//    from a single address). Real edge rate limiting belongs in nginx/CDN.
const SOFT_RATE_LIMIT = Math.max(
  1,
  parseInt(process.env.COLLECT_SOFT_RATE_LIMIT || "300", 10) || 300
);
const HARD_RATE_LIMIT = Math.max(
  SOFT_RATE_LIMIT,
  parseInt(process.env.COLLECT_HARD_RATE_LIMIT || "10000", 10) || 10000
);
const RATE_WINDOW_MS = 60_000;

const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

interface RateVerdict {
  overSoft: boolean;
  overHard: boolean;
}

function checkRate(key: string): RateVerdict {
  if (!key) return { overSoft: false, overHard: false };
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || record.expiresAt < now) {
    rateLimitMap.set(key, { count: 1, expiresAt: now + RATE_WINDOW_MS });
    return { overSoft: false, overHard: false };
  }

  record.count += 1;
  return {
    overSoft: record.count > SOFT_RATE_LIMIT,
    overHard: record.count > HARD_RATE_LIMIT,
  };
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitMap.entries()) {
    if (value.expiresAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60 * 1000);

// VULN-009 FIX: Input sanitization helpers
const MAX_STRING_LENGTH = 2048; // Max length for any single field
const MAX_URL_LENGTH = 4096;

function sanitizeString(val: unknown, maxLen = MAX_STRING_LENGTH): string {
  if (typeof val !== "string") return "";
  // Truncate to max length
  const truncated = val.slice(0, maxLen);
  // Strip null bytes (PostgreSQL doesn't accept them)
  return truncated.replace(/\0/g, "");
}

function sanitizeUrl(val: unknown): string {
  return sanitizeString(val, MAX_URL_LENGTH);
}

// Sanitize for CSV injection prevention when data is later exported
function sanitizeCsvSafe(val: unknown, maxLen = MAX_STRING_LENGTH): string {
  const clean = sanitizeString(val, maxLen);
  // Strip leading characters that trigger formula execution in spreadsheets
  if (/^[=+\-@\t\r]/.test(clean)) {
    return "'" + clean;
  }
  return clean;
}

// ---- CORS + Performance Headers ----
// Access-Control-Allow-Credentials is required because sendBeacon uses credentials mode "include".
// This is safe: the endpoint is write-only, and the dashboard session cookie is SameSite=Lax
// (not sent on cross-origin POST requests).
function getHeaders(request?: NextRequest) {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Timing-Allow-Origin": origin,
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

// ---- Duration bounds ----
// The tracker reports ENGAGED (foreground) seconds per page, clamped to
// 0..1800. The server clamps again because copies of the old t.js, which
// reported wall-clock time including hours or days in a background tab, stay
// cached on visitors' browsers and would otherwise keep writing runaway
// values that dominate every average.
const MAX_PAGE_DURATION_SECS = 1800; // matches the 30-minute session timeout
const MAX_SESSION_DURATION_SECS = 4 * 3600;

function clampDuration(val: unknown): number {
  const raw = Number(val);
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.round(raw), 0), MAX_PAGE_DURATION_SECS);
}

// ---- Geo-IP ----
// Only the headers of the CDN actually in front of the origin are trusted.
// The old chain also read x-country and the client payload, and consulted
// x-vercel-ip-country first even behind Cloudflare, so anyone could set a
// visitor's country by sending a header. Override with GEO_HEADER_SOURCE.
type GeoSource = "cloudflare" | "vercel" | "cloudfront" | "fly";

const GEO_SOURCE: GeoSource = (() => {
  const configured = (process.env.GEO_HEADER_SOURCE || "").trim().toLowerCase();
  if (
    configured === "cloudflare" ||
    configured === "vercel" ||
    configured === "cloudfront" ||
    configured === "fly"
  ) {
    return configured;
  }
  return process.env.VERCEL ? "vercel" : "cloudflare";
})();

const GEO_HEADERS: Record<GeoSource, { country: string; city: string | null }> = {
  cloudflare: { country: "cf-ipcountry", city: "cf-ipcity" },
  vercel: { country: "x-vercel-ip-country", city: "x-vercel-ip-city" },
  cloudfront: { country: "cloudfront-viewer-country", city: "cloudfront-viewer-city" },
  fly: { country: "fly-client-ip-country", city: null },
};

/**
 * ISO 3166-1 alpha-2 or "". Cloudflare's "XX" (unknown) and "T1" (Tor exit)
 * are not countries and used to be stored verbatim as if they were.
 */
function normalizeCountry(value: string | null): string {
  const raw = (value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) && raw !== "XX" && raw !== "T1" ? raw : "";
}

function normalizeCity(value: string | null): string {
  let raw = (value || "").trim();
  if (!raw) return "";
  // Vercel URL-encodes the city ("S%C3%A3o%20Paulo"); decoding a plain value
  // is a no-op, and a malformed escape is kept as sent.
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  return sanitizeString(raw, 128);
}

function readGeo(request: NextRequest): { country: string; city: string } {
  const names = GEO_HEADERS[GEO_SOURCE];
  return {
    country: normalizeCountry(request.headers.get(names.country)),
    city: names.city ? normalizeCity(request.headers.get(names.city)) : "",
  };
}

// ---- Goal conversions ----
// goal_conversions.session_id is a foreign key to sessions.id. An event or
// duration beacon can be processed before the pageview that creates its
// session row has committed (they are separate beacons handled concurrently),
// so a foreign-key violation is retried once after a short wait instead of
// silently losing the conversion.
const GOAL_FK_RETRY_MS = 2000;

function pgErrorCode(err: unknown): string | undefined {
  // Drizzle wraps driver errors (DrizzleQueryError), so walk the cause chain.
  let cur: unknown = err;
  for (let i = 0; i < 3 && cur && typeof cur === "object"; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === "string") return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

async function recordGoalConversion(values: {
  goal_id: string;
  site_id: string;
  session_id: string;
  visitor_id: string;
}): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await db.insert(goalConversions).values(values).onConflictDoNothing();
      return;
    } catch (err) {
      if (attempt === 0 && pgErrorCode(err) === "23503") {
        await new Promise((r) => setTimeout(r, GOAL_FK_RETRY_MS));
        continue;
      }
      console.error(
        `[collect] Goal conversion insert failed (goal ${values.goal_id}, site ${values.site_id}, session ${values.session_id}):`,
        err
      );
      return;
    }
  }
}

/**
 * Upsert a session record: creates on first pageview, updates on subsequent.
 */
async function upsertSession(
  siteId: string,
  data: Record<string, unknown>,
  country: string,
  city: string,
  verdict: BotVerdict,
  visitorId: string
): Promise<void> {
  const sessionId = sanitizeString(data.session_id, 128);
  const url = sanitizeUrl(data.url);
  if (!sessionId) return;

  const now = new Date();

  try {
    await db
      .insert(sessions)
      .values({
        id: sessionId,
        site_id: siteId,
        visitor_id: visitorId,
        entry_page: url,
        exit_page: url,
        page_count: 1,
        total_duration: 0,
        // Already self-referral-stripped by the pageview case.
        referrer: sanitizeUrl(data.referrer),
        utm_source: sanitizeString(data.utm_source, 256),
        utm_medium: sanitizeString(data.utm_medium, 256),
        utm_campaign: sanitizeString(data.utm_campaign, 256),
        country,
        city,
        browser: sanitizeString(data.browser, 128),
        os: sanitizeString(data.os, 128),
        device: sanitizeString(data.device, 64),
        screen: sanitizeString(data.screen, 32),
        language: sanitizeString(data.language, 32),
        timezone: sanitizeString(data.timezone, 64),
        connection_type: sanitizeString(data.connection_type, 32),
        is_bot: verdict.isBot,
        bot_reason: encodeBotReason(verdict),
        bot_score: verdict.score,
        is_bounce: true,
        started_at: now,
        ended_at: now,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          exit_page: url,
          page_count: sql`${sessions.page_count} + 1`,
          is_bounce: false,
          ended_at: now,
        },
      });
  } catch (err) {
    console.error("[collect] Session upsert error:", err);
  }
}

interface ResolvedSession {
  sessionId: string;
  /**
   * visitor_id to write on this payload's rows. When an existing session is
   * continued this is the session's own visitor_id, so a visit that crosses
   * 00:00 UTC keeps one visitor instead of switching hash mid-session.
   */
  visitorId: string;
  /** Set when the payload was attached to a session flagged as a bot. */
  botSession: { reason: string | null; score: number | null } | null;
}

async function findActiveSession(
  siteId: string,
  visitorIds: string[],
  isBot: boolean,
  since: Date
) {
  const rows = await db
    .select({
      id: sessions.id,
      visitor_id: sessions.visitor_id,
      bot_reason: sessions.bot_reason,
      bot_score: sessions.bot_score,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.site_id, siteId),
        inArray(sessions.visitor_id, visitorIds),
        eq(sessions.is_bot, isBot),
        gte(sessions.ended_at, since)
      )
    )
    .orderBy(desc(sessions.ended_at))
    .limit(1);
  return rows[0];
}

/**
 * Reuse an in-flight session for the same visitor, or fall back to the
 * client-supplied id.
 *
 * Scoped by is_bot so a crawler sharing an egress IP with a real person can
 * never be stitched into that person's session (which would flip is_bounce
 * and inflate page_count on otherwise clean data).
 *
 * `visitorIds` is [today, yesterday] (see computeVisitorIds); the most
 * recently active match under either salt wins.
 *
 * With `inheritBot` (events and duration beacons, which carry none of the
 * environment fields the pageview was judged on) a request that looks human
 * is still attached to a flagged session when either the client's session id
 * already is one, or the visitor's only active session is one. The caller
 * then upgrades the verdict so those rows do not appear as human data.
 */
async function resolveSession(
  siteId: string,
  visitorIds: string[],
  clientSessionId: string,
  isBot: boolean,
  inheritBot: boolean
): Promise<ResolvedSession> {
  const fallback: ResolvedSession = {
    sessionId: clientSessionId || randomUUID(),
    visitorId: visitorIds[0] || "",
    botSession: null,
  };
  const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);

  try {
    if (inheritBot && !isBot && clientSessionId) {
      const [own] = await db
        .select({
          id: sessions.id,
          visitor_id: sessions.visitor_id,
          is_bot: sessions.is_bot,
          bot_reason: sessions.bot_reason,
          bot_score: sessions.bot_score,
        })
        .from(sessions)
        .where(and(eq(sessions.id, clientSessionId), eq(sessions.site_id, siteId)))
        .limit(1);
      if (own?.is_bot) {
        return {
          sessionId: own.id,
          visitorId: own.visitor_id,
          botSession: { reason: own.bot_reason, score: own.bot_score },
        };
      }
    }

    if (visitorIds.length === 0) return fallback;

    const active = await findActiveSession(siteId, visitorIds, isBot, thirtyMinsAgo);
    if (active) {
      return { sessionId: active.id, visitorId: active.visitor_id, botSession: null };
    }

    if (inheritBot && !isBot) {
      const flagged = await findActiveSession(siteId, visitorIds, true, thirtyMinsAgo);
      if (flagged) {
        return {
          sessionId: flagged.id,
          visitorId: flagged.visitor_id,
          botSession: { reason: flagged.bot_reason, score: flagged.bot_score },
        };
      }
    }
  } catch (err) {
    console.error("[collect] Error resolving session ID:", err);
  }
  return fallback;
}

/**
 * Processes the analytics payload in the background.
 */
async function processPayload(
  siteId: string,
  siteDomain: string,
  type: string,
  data: Record<string, unknown>,
  country: string,
  city: string,
  ipHash: string,
  visitorIds: string[],
  requestVerdict: BotVerdict
): Promise<void> {
  const clientSessionId = sanitizeString(data.session_id, 128);

  // Resolve active session server-side to avoid cookie/localStorage consent requirements
  const resolved = await resolveSession(
    siteId,
    visitorIds,
    clientSessionId,
    requestVerdict.isBot,
    type === "event" || type === "duration"
  );
  const sessionId = resolved.sessionId;
  const visitorId = resolved.visitorId;
  data.session_id = sessionId;

  const verdict = resolved.botSession
    ? inheritSessionVerdict(requestVerdict, resolved.botSession)
    : requestVerdict;
  const isBot = verdict.isBot;
  const botReason = encodeBotReason(verdict);

  try {
    switch (type) {
      case "pageview": {
        // Self-referrals (the site's own domain or any subdomain of it) are
        // internal navigation, not a traffic source. The tracker only sends
        // document.referrer on a real landing, but old cached copies, links
        // between subdomains and visits resumed after the session timeout
        // still produce them, and they used to show up as a top "source".
        let referrer = sanitizeUrl(data.referrer);
        if (referrer && siteDomain && hostMatchesDomain(referrer, siteDomain)) {
          referrer = "";
        }
        data.referrer = referrer;

        // Insert pageview row
        // VULN-009 FIX: Sanitize all input fields with length limits
        await db.insert(pageviews).values({
          site_id: siteId,
          url: sanitizeUrl(data.url),
          referrer,
          title: sanitizeCsvSafe(data.title, 512),
          utm_source: sanitizeString(data.utm_source, 256),
          utm_medium: sanitizeString(data.utm_medium, 256),
          utm_campaign: sanitizeString(data.utm_campaign, 256),
          visitor_id: visitorId, // Cookieless: salted hash of IP + User-Agent
          session_id: sessionId,
          country,
          city,
          browser: sanitizeString(data.browser, 128),
          os: sanitizeString(data.os, 128),
          device: sanitizeString(data.device, 64),
          ip_hash: ipHash,
          screen: sanitizeString(data.screen, 32),
          language: sanitizeString(data.language, 32),
          timezone: sanitizeString(data.timezone, 64),
          duration: 0,
          connection_type: sanitizeString(data.connection_type, 32) || null,
          ttfb: typeof data.ttfb === "number" ? Math.min(Math.max(data.ttfb, 0), 60000) : null,
          is_bot: isBot,
          bot_reason: botReason,
          bot_score: verdict.score,
        });

        // Awaited: goal_conversions.session_id references sessions.id, so the
        // session row has to exist before a goal on this (possibly first)
        // pageview is recorded. Un-awaited, the conversion insert raced the
        // session insert on another pool connection and lost conversions on
        // landing pages to FK violations. upsertSession catches its own errors.
        await upsertSession(siteId, data, country, city, verdict, visitorId);

        // Evaluate Pageview Goals.
        // goal_conversions has no is_bot column, so bot traffic is skipped
        // outright rather than polluting conversion counts.
        if (!isBot && sessionId && visitorId) {
          try {
            const siteGoals = await getCachedGoals(siteId);
            const pvGoals = siteGoals.filter((g) => g.type === "pageview");
            const currentUrl = (data.url as string) || "";

            for (const goal of pvGoals) {
              let matched = false;
              const target = goal.target;
              if (goal.condition === "equals" && currentUrl === target) matched = true;
              else if (goal.condition === "contains" && currentUrl.includes(target)) matched = true;
              else if (goal.condition === "starts_with" && currentUrl.startsWith(target)) matched = true;

              if (matched) {
                await recordGoalConversion({
                  goal_id: goal.id,
                  site_id: siteId,
                  session_id: sessionId,
                  visitor_id: visitorId,
                });
              }
            }
          } catch (err) {
            console.error(`[collect] Pageview goal evaluation error (site ${siteId}):`, err);
          }
        }

        break;
      }

      case "event": {
        // VULN-009 FIX: Sanitize event data + limit properties size
        const rawProps = (data.properties as Record<string, unknown>) || {};
        const propsStr = JSON.stringify(rawProps);
        const safeProps = propsStr.length > 8192 ? {} : rawProps; // 8KB limit on properties
        await db.insert(events).values({
          site_id: siteId,
          name: sanitizeString(data.name, 256) || "unknown",
          properties: safeProps,
          visitor_id: visitorId,
          session_id: sessionId,
          url: sanitizeUrl(data.url),
          is_bot: isBot,
          bot_reason: botReason,
          bot_score: verdict.score,
        });

        // Evaluate Event Goals (human traffic only — see pageview case)
        if (!isBot && sessionId && visitorId) {
          try {
            const siteGoals = await getCachedGoals(siteId);
            const eventGoals = siteGoals.filter((g) => g.type === "event");
            const eventName = (data.name as string) || "unknown";

            for (const goal of eventGoals) {
              let matched = false;
              const target = goal.target;
              if (goal.condition === "equals" && eventName === target) matched = true;
              else if (goal.condition === "contains" && eventName.includes(target)) matched = true;
              else if (goal.condition === "starts_with" && eventName.startsWith(target)) matched = true;

              if (matched) {
                await recordGoalConversion({
                  goal_id: goal.id,
                  site_id: siteId,
                  session_id: sessionId,
                  visitor_id: visitorId,
                });
              }
            }
          } catch (err) {
            console.error(`[collect] Event goal evaluation error (site ${siteId}):`, err);
          }
        }
        break;
      }

      case "duration": {
        // NB: no `const sessionId` here — all case clauses share one block
        // scope, so re-declaring it would put the outer binding used by the
        // pageview/event cases into the temporal dead zone.
        const durationVal = clampDuration(data.duration);
        const pageUrl = sanitizeUrl(data.url);

        // Locate the pageview row this beacon belongs to: first within the
        // resolved session, then — because a beacon can re-resolve to a
        // different session than its pageview did (a concurrent tab, or a
        // tab left idle past the 30-minute window) — the visitor's most recent
        // view of the same URL in the last day.
        const pvColumns = {
          id: pageviews.id,
          session_id: pageviews.session_id,
          created_at: pageviews.created_at,
        };
        let [pv] = await db
          .select(pvColumns)
          .from(pageviews)
          .where(
            and(
              eq(pageviews.session_id, sessionId),
              eq(pageviews.url, pageUrl),
              eq(pageviews.site_id, siteId)
            )
          )
          .orderBy(desc(pageviews.created_at))
          .limit(1);

        if (!pv && visitorIds.length > 0) {
          const candidates = Array.from(new Set([visitorId, ...visitorIds].filter(Boolean)));
          [pv] = await db
            .select(pvColumns)
            .from(pageviews)
            .where(
              and(
                eq(pageviews.site_id, siteId),
                inArray(pageviews.visitor_id, candidates),
                eq(pageviews.url, pageUrl),
                gte(pageviews.created_at, new Date(Date.now() - 24 * 3600 * 1000))
              )
            )
            .orderBy(desc(pageviews.created_at))
            .limit(1);
        }

        const durationSessionId = pv?.session_id || sessionId;

        if (pv && durationVal > 0) {
          // Engaged time only grows, so GREATEST keeps an out-of-order or
          // earlier heartbeat from shrinking the stored value.
          await db
            .update(pageviews)
            .set({ duration: sql`GREATEST(COALESCE(${pageviews.duration}, 0), ${durationVal})` })
            .where(eq(pageviews.id, pv.id));

          // Session total = sum of its pages' engaged time (each capped). It
          // used to be GREATEST(total, this page), i.e. the longest single
          // page, which undercounted every multi-page visit. GREATEST with
          // the stored value keeps concurrent beacons from racing it down,
          // since the sum itself only ever grows.
          //
          // ended_at moves to when this page's engagement could have ended at
          // the latest, not to "now": a beacon from a tab hidden for hours
          // must not stretch the session (or keep it open for stitching).
          const pageEnd = new Date(
            Math.min(Date.now(), pv.created_at.getTime() + durationVal * 1000)
          );
          try {
            await db
              .update(sessions)
              .set({
                total_duration: sql`LEAST(GREATEST(${sessions.total_duration}, (SELECT COALESCE(SUM(LEAST(${pageviews.duration}, ${MAX_PAGE_DURATION_SECS})), 0) FROM ${pageviews} WHERE ${pageviews.session_id} = ${durationSessionId} AND ${pageviews.site_id} = ${siteId})), ${MAX_SESSION_DURATION_SECS})::int`,
                ended_at: sql`GREATEST(${sessions.ended_at}, ${pageEnd})`,
              })
              .where(and(eq(sessions.id, durationSessionId), eq(sessions.site_id, siteId)));
          } catch (err) {
            console.error(`[collect] Session duration update error (site ${siteId}):`, err);
          }
        }

        // Evaluate Duration Goals (human traffic only — see pageview case)
        if (!isBot && durationSessionId && visitorId) {
          try {
            const siteGoals = await getCachedGoals(siteId);
            const durationGoals = siteGoals.filter((g) => g.type === "duration");

            for (const goal of durationGoals) {
              let matched = false;
              const targetSecs = parseInt(goal.target, 10);
              if (!isNaN(targetSecs) && goal.condition === "greater_than" && durationVal > targetSecs) {
                matched = true;
              }

              if (matched) {
                await recordGoalConversion({
                  goal_id: goal.id,
                  site_id: siteId,
                  session_id: durationSessionId,
                  visitor_id: visitorId,
                });
              }
            }
          } catch (err) {
            console.error(`[collect] Duration goal evaluation error (site ${siteId}):`, err);
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[collect] Background ${type} error (site ${siteId}):`, err);
  }
}

/**
 * POST /api/collect — Receives tracking data from t.js
 * Responds 204 instantly; the DB writes run in after() so the runtime keeps
 * them alive past the response (waitUntil on serverless, post-response on a
 * Node server) instead of an untracked floating promise.
 */
export async function POST(request: NextRequest) {
  const headers = getHeaders(request);

  try {
    const body = await request.json();
    const { api_key, type, data } = body;

    if (!api_key || !type || !data) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers }
      );
    }

    // ---- Resolve site ----
    let site = getCachedSite(api_key);

    if (site === undefined) {
      const result = await db
        .select({ id: sites.id, domain: sites.domain })
        .from(sites)
        .where(eq(sites.api_key, api_key))
        .limit(1);

      if (result.length === 0) {
        setCachedInvalid(api_key);
        return NextResponse.json(
          { error: "Invalid API key" },
          { status: 400, headers }
        );
      }

      site = { siteId: result[0].id, domain: result[0].domain || "" };
      setCachedSite(api_key, site.siteId, site.domain);
    }

    if (site.siteId === "") {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 400, headers }
      );
    }

    const siteId = site.siteId;

    // ---- Extract Geo-IP ----
    // Edge headers only; client-supplied data.country / data.city are ignored.
    const { country, city } = readGeo(request);

    // ---- Identity ----
    const userAgent = request.headers.get("user-agent") || "";
    const ipStr = getClientIp(request);
    const ipHash = hashIp(ipStr);
    const visitorIds = computeVisitorIds(ipStr, userAgent);

    // ---- Request-rate ceilings ----
    // Keyed on the IP hash only. The old implementation also keyed on
    // session_id and short-circuited, so the session counter never advanced.
    const rate = checkRate(ipHash);

    if (rate.overHard) {
      // The single place this endpoint discards data. Not a bot judgement —
      // it is the ceiling that stops a script from filling the database.
      // Tune with COLLECT_HARD_RATE_LIMIT.
      console.warn(
        `[collect] Hard rate ceiling hit for site ${siteId} (>${HARD_RATE_LIMIT}/min from one IP); dropping payload.`
      );
      return new NextResponse(null, { status: 204, headers });
    }

    // ---- Classify (flag, never drop) ----
    const verdict: BotVerdict = detectBot({
      userAgent,
      header: (name) => request.headers.get(name),
      payload: data as Record<string, unknown>,
      siteDomain: site.domain,
      country,
      floodSuspected: rate.overSoft,
      clientBotHint: data.bot_hint === 1 || data.bot_hint === true,
    });

    // ---- Background write ----
    // Bot traffic is written too, flagged with its reason and score, so the
    // filter stays measurable and any false positive is recoverable with an
    // UPDATE instead of being gone forever. Dashboards exclude is_bot rows.
    const siteDomain = site.domain;
    after(() =>
      processPayload(siteId, siteDomain, type, data, country, city, ipHash, visitorIds, verdict)
    );

    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    console.error("[collect] Route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers }
    );
  }
}
