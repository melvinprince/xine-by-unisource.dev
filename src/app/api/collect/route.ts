import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, pageviews, events, sessions, goalConversions } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCachedGoals } from "@/lib/goals-cache";
import { createHash, randomUUID } from "crypto";
import {
  detectBot,
  encodeBotReason,
  type BotVerdict,
} from "@/lib/bot-detection";
import { getClientIp } from "@/lib/client-ip";
import {
  getCachedSite,
  setCachedSite,
  setCachedInvalid,
} from "@/lib/api-key-cache";

// ---- Daily-rotating salt for IP hashing ----
let dailySalt = "";
let saltDate = "";

function getDailySalt(): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== saltDate) {
    // VULN-014 FIX: Include server-side secret in salt to prevent precomputation
    const serverSecret = process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD || "";
    dailySalt = createHash("sha256")
      .update(today + "-wa-pro-salt-" + serverSecret + "-" + process.env.NODE_ENV)
      .digest("hex")
      .slice(0, 16);
    saltDate = today;
  }
  return dailySalt;
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
function computeVisitorId(ip: string, userAgent: string): string {
  if (!ip && !userAgent) return "";
  return createHash("sha256")
    .update(ip + "|" + userAgent + "|" + getDailySalt())
    .digest("hex")
    .slice(0, 16);
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
  const sessionId = (data.session_id as string) || "";
  const url = (data.url as string) || "";
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
        referrer: (data.referrer as string) || "",
        utm_source: (data.utm_source as string) || "",
        utm_medium: (data.utm_medium as string) || "",
        utm_campaign: (data.utm_campaign as string) || "",
        country,
        city,
        browser: (data.browser as string) || "",
        os: (data.os as string) || "",
        device: (data.device as string) || "",
        screen: (data.screen as string) || "",
        timezone: (data.timezone as string) || "",
        connection_type: (data.connection_type as string) || "",
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

/**
 * Reuse an in-flight session for the same visitor, or fall back to the
 * client-supplied id.
 *
 * Scoped by is_bot so a crawler sharing an egress IP with a real person can
 * never be stitched into that person's session (which would flip is_bounce
 * and inflate page_count on otherwise clean data).
 */
async function resolveSessionId(
  siteId: string,
  visitorId: string,
  clientSessionId: string,
  isBot: boolean
): Promise<string> {
  if (!visitorId) return clientSessionId || randomUUID();
  const now = new Date();
  const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000);
  try {
    const activeSession = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.site_id, siteId),
          eq(sessions.visitor_id, visitorId),
          eq(sessions.is_bot, isBot),
          sql`${sessions.ended_at} >= ${thirtyMinsAgo}`
        )
      )
      .orderBy(desc(sessions.ended_at))
      .limit(1);

    if (activeSession.length > 0) {
      return activeSession[0].id;
    }
  } catch (err) {
    console.error("[collect] Error resolving session ID:", err);
  }
  return clientSessionId || randomUUID();
}

/**
 * Processes the analytics payload in the background.
 */
async function processPayload(
  siteId: string,
  type: string,
  data: Record<string, unknown>,
  country: string,
  city: string,
  ipHash: string,
  visitorId: string,
  verdict: BotVerdict
): Promise<void> {
  const isBot = verdict.isBot;
  const botReason = encodeBotReason(verdict);

  // Resolve active session server-side to avoid cookie/localStorage consent requirements
  const sessionId = await resolveSessionId(
    siteId,
    visitorId,
    (data.session_id as string) || "",
    isBot
  );
  data.session_id = sessionId;

  try {
    switch (type) {
      case "pageview": {
        // Insert pageview row
        // VULN-009 FIX: Sanitize all input fields with length limits
        await db.insert(pageviews).values({
          site_id: siteId,
          url: sanitizeUrl(data.url),
          referrer: sanitizeUrl(data.referrer),
          title: sanitizeCsvSafe(data.title, 512),
          utm_source: sanitizeString(data.utm_source, 256),
          utm_medium: sanitizeString(data.utm_medium, 256),
          utm_campaign: sanitizeString(data.utm_campaign, 256),
          visitor_id: visitorId, // Cookieless: salted hash of IP + User-Agent
          session_id: sanitizeString(data.session_id, 128),
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

        // Upsert session (fire-and-forget within fire-and-forget)
        upsertSession(siteId, data, country, city, verdict, visitorId);

        // Evaluate Pageview Goals.
        // goal_conversions has no is_bot column, so bot traffic is skipped
        // outright rather than polluting conversion counts.
        if (!isBot) {
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

              if (matched && sessionId && visitorId) {
                await db.insert(goalConversions).values({
                  goal_id: goal.id,
                  site_id: siteId,
                  session_id: sessionId,
                  visitor_id: visitorId,
                }).onConflictDoNothing(); // prevent duplicate insert errors if any
              }
            }
          } catch (err) {
            console.error("[collect] Goal checking error:", err);
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
          session_id: sanitizeString(data.session_id, 128),
          url: sanitizeUrl(data.url),
          is_bot: isBot,
          bot_reason: botReason,
          bot_score: verdict.score,
        });

        // Evaluate Event Goals (human traffic only — see pageview case)
        if (!isBot) {
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

              if (matched && sessionId && visitorId) {
                await db.insert(goalConversions).values({
                  goal_id: goal.id,
                  site_id: siteId,
                  session_id: sessionId,
                  visitor_id: visitorId,
                }).onConflictDoNothing();
              }
            }
          } catch (err) { }
        }
        break;
      }

      case "duration": {
        // NB: no `const sessionId` here — all case clauses share one block
        // scope, so re-declaring it would put the outer binding used by the
        // pageview/event cases into the temporal dead zone.
        const durationVal = (data.duration as number) || 0;

        // Update the matching pageview row
        const rows = await db
          .select({ id: pageviews.id })
          .from(pageviews)
          .where(
            and(
              eq(pageviews.session_id, sessionId),
              eq(pageviews.url, (data.url as string) || ""),
              eq(pageviews.site_id, siteId)
            )
          )
          .orderBy(desc(pageviews.created_at))
          .limit(1);

        if (rows.length > 0) {
          await db
            .update(pageviews)
            .set({ duration: durationVal })
            .where(eq(pageviews.id, rows[0].id));
        }

        // Also update session total_duration
        if (sessionId && durationVal > 0) {
          try {
            await db
              .update(sessions)
              .set({
                total_duration: sql`GREATEST(${sessions.total_duration}, ${durationVal})`,
                ended_at: new Date(),
              })
              .where(eq(sessions.id, sessionId));
          } catch {
            // Session might not exist yet — ignore
          }
        }

        // Evaluate Duration Goals (human traffic only — see pageview case)
        if (!isBot) {
          try {
            const siteGoals = await getCachedGoals(siteId);
            const durationGoals = siteGoals.filter((g) => g.type === "duration");

            for (const goal of durationGoals) {
              let matched = false;
              const targetSecs = parseInt(goal.target, 10);
              if (!isNaN(targetSecs) && goal.condition === "greater_than" && durationVal > targetSecs) {
                matched = true;
              }

              if (matched && sessionId && visitorId) {
                await db.insert(goalConversions).values({
                  goal_id: goal.id,
                  site_id: siteId,
                  session_id: sessionId,
                  visitor_id: visitorId,
                }).onConflictDoNothing();
              }
            }
          } catch (err) { }
        }
        break;
      }
    }
  } catch (err) {
    console.error(`[collect] Background ${type} error:`, err);
  }
}

/**
 * POST /api/collect — Receives tracking data from t.js
 * Fire-and-forget: responds 204 instantly, DB write runs in background.
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
    const country =
      request.headers.get("x-vercel-ip-country") ||
      request.headers.get("cf-ipcountry") ||
      request.headers.get("cloudfront-viewer-country") ||
      request.headers.get("x-country") ||
      request.headers.get("fly-client-ip-country") ||
      (data.country as string) ||
      "";
    const city =
      request.headers.get("x-vercel-ip-city") ||
      request.headers.get("cf-ipcity") ||
      (data.city as string) ||
      "";

    // ---- Identity ----
    const userAgent = request.headers.get("user-agent") || "";
    const ipStr = getClientIp(request);
    const ipHash = hashIp(ipStr);
    const visitorId = computeVisitorId(ipStr, userAgent);

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
      floodSuspected: rate.overSoft,
      clientBotHint: data.bot_hint === 1 || data.bot_hint === true,
    });

    // ---- Fire-and-forget ----
    // Bot traffic is written too, flagged with its reason and score, so the
    // filter stays measurable and any false positive is recoverable with an
    // UPDATE instead of being gone forever. Dashboards exclude is_bot rows.
    processPayload(siteId, type, data, country, city, ipHash, visitorId, verdict);

    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    console.error("[collect] Route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers }
    );
  }
}
