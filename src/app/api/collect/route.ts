import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, pageviews, events, sessions, goalConversions } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getCachedGoals } from "@/lib/goals-cache";
import { createHash } from "crypto";
import { isbot } from "isbot";
import {
  getCachedSiteId,
  setCachedSiteId,
  setCachedInvalid,
} from "@/lib/api-key-cache";

// ---- Daily-rotating salt for IP hashing ----
let dailySalt = "";
let saltDate = "";

function getDailySalt(): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== saltDate) {
    dailySalt = createHash("sha256")
      .update(today + "-wa-pro-salt-" + process.env.NODE_ENV)
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

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    ""
  );
}

// ---- Simple In-Memory Rate Limiter ----
const rateLimitMap = new Map<string, { count: number; expiresAt: number }>();

function isRateLimited(key: string): boolean {
  if (!key) return false;
  const now = Date.now();
  const record = rateLimitMap.get(key);
  
  if (!record || record.expiresAt < now) {
    rateLimitMap.set(key, { count: 1, expiresAt: now + 60000 }); // 1 minute window
    return false;
  }
  
  record.count += 1;
  return record.count > 100; // >100 requests per minute per IP/Session is likely a bot
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

// ---- Referrer Spam Blocklist ----
const SPAM_REFERRER_KEYWORDS = [
  "traffic", "seo", "rank", "buy", "cheap", "cryptocloud", 
  "free", "money", "earn", "click", "casino", "porn"
];

function isSpamReferrer(referrer: string): boolean {
  if (!referrer) return false;
  const lower = referrer.toLowerCase();
  // Always permit major search engines
  if (lower.includes("google.") || lower.includes("bing.") || lower.includes("yahoo.")) return false;
  return SPAM_REFERRER_KEYWORDS.some(kw => lower.includes(kw));
}

// ---- CORS + Performance Headers ----
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
  isBot: boolean
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
        visitor_id: (data.visitor_id as string) || "",
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
        is_bot: isBot,
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
 * Processes the analytics payload in the background.
 */
async function processPayload(
  siteId: string,
  type: string,
  data: Record<string, unknown>,
  country: string,
  city: string,
  ipHash: string,
  isBot: boolean
): Promise<void> {
  try {
    switch (type) {
      case "pageview": {
        // Insert pageview row
        await db.insert(pageviews).values({
          site_id: siteId,
          url: (data.url as string) || "",
          referrer: (data.referrer as string) || "",
          title: (data.title as string) || "",
          utm_source: (data.utm_source as string) || "",
          utm_medium: (data.utm_medium as string) || "",
          utm_campaign: (data.utm_campaign as string) || "",
          visitor_id: (data.visitor_id as string) || "",
          session_id: (data.session_id as string) || "",
          country,
          city,
          browser: (data.browser as string) || "",
          os: (data.os as string) || "",
          device: (data.device as string) || "",
          ip_hash: ipHash,
          screen: (data.screen as string) || "",
          language: (data.language as string) || "",
          timezone: (data.timezone as string) || "",
          duration: 0,
          connection_type: (data.connection_type as string) || null,
          ttfb: typeof data.ttfb === "number" ? data.ttfb : null,
          is_bot: isBot,
        });

        // Upsert session (fire-and-forget within fire-and-forget)
        upsertSession(siteId, data, country, city, isBot);

        // Evaluate Pageview Goals
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
            
            if (matched && data.session_id && data.visitor_id) {
              await db.insert(goalConversions).values({
                goal_id: goal.id,
                site_id: siteId,
                session_id: data.session_id as string,
                visitor_id: data.visitor_id as string,
              }).onConflictDoNothing(); // prevent duplicate insert errors if any
            }
          }
        } catch (err) {
          console.error("[collect] Goal checking error:", err);
        }

        break;
      }

      case "event": {
        await db.insert(events).values({
          site_id: siteId,
          name: (data.name as string) || "unknown",
          properties: (data.properties as Record<string, unknown>) || {},
          visitor_id: (data.visitor_id as string) || "",
          session_id: (data.session_id as string) || "",
          url: (data.url as string) || "",
        });

        // Evaluate Event Goals
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
            
            if (matched && data.session_id && data.visitor_id) {
              await db.insert(goalConversions).values({
                goal_id: goal.id,
                site_id: siteId,
                session_id: data.session_id as string,
                visitor_id: data.visitor_id as string,
              });
            }
          }
        } catch (err) { }
        break;
      }

      case "duration": {
        const sessionId = (data.session_id as string) || "";
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

        // Evaluate Duration Goals
        try {
          const siteGoals = await getCachedGoals(siteId);
          const durationGoals = siteGoals.filter((g) => g.type === "duration");
          
          for (const goal of durationGoals) {
            let matched = false;
            const targetSecs = parseInt(goal.target, 10);
            if (!isNaN(targetSecs) && goal.condition === "greater_than" && durationVal > targetSecs) {
              matched = true;
            }
            
            if (matched && sessionId && data.visitor_id) {
              await db.insert(goalConversions).values({
                goal_id: goal.id,
                site_id: siteId,
                session_id: sessionId,
                visitor_id: data.visitor_id as string,
              }).onConflictDoNothing();
            }
          }
        } catch (err) { }
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

    // ---- Resolve site_id ----
    let siteId = getCachedSiteId(api_key);

    if (siteId === undefined) {
      const result = await db
        .select({ id: sites.id })
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

      siteId = result[0].id;
      setCachedSiteId(api_key, siteId);
    }

    if (siteId === "") {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 400, headers }
      );
    }

    // ---- Extract Bot ----
    const userAgent = request.headers.get("user-agent") || "";
    let isBot = false;

    // Pillar 1: Robust UA Filtering (isbot library) + Missing UA
    if (!userAgent || isbot(userAgent)) {
      isBot = true;
    }

    // Pillar 2: Referrer Spam Check
    const referrer = (data.referrer as string) || request.headers.get("referer") || "";
    if (!isBot && isSpamReferrer(referrer)) {
      isBot = true;
    }

    // Pillar 3: Datacenter / Automated Request Headers
    // e.g., missing Accept-Language but executing JS is very suspicious
    if (!isBot && !request.headers.get("accept-language")) {
      isBot = true;
    }

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

    // ---- Hash IP ----
    const ipStr = getClientIp(request);
    const ipHash = hashIp(ipStr);

    // Pillar 4: Behavioral Rate Limiting
    if (!isBot) {
      if (isRateLimited(ipHash) || (data.session_id && isRateLimited(data.session_id as string))) {
        isBot = true;
      }
    }

    // ---- Fire-and-forget ----
    processPayload(siteId, type, data, country, city, ipHash, isBot);

    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    console.error("[collect] Route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers }
    );
  }
}
