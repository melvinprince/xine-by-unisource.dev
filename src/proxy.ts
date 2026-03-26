import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "analytics_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ── In-memory ban cache (avoids DB hit on every request) ──
const banCache = new Map<string, number>(); // ip → cached timestamp
const BAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function isIpBanned(ip: string): Promise<boolean> {
  // Check in-memory cache first
  const cached = banCache.get(ip);
  if (cached && Date.now() - cached < BAN_CACHE_TTL) {
    return true;
  }

  // Query database
  try {
    const { db } = await import("@/lib/db");
    const { bannedLogins } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    const bans = await db
      .select({ id: bannedLogins.id })
      .from(bannedLogins)
      .where(eq(bannedLogins.ip, ip))
      .limit(1);

    if (bans.length > 0) {
      banCache.set(ip, Date.now());
      return true;
    }
  } catch (error) {
    console.error("Ban check failed:", error);
    // Fail open — don't block if DB is unreachable
  }

  return false;
}

// Export a function to update the cache when a new ban is created
export function addToBanCache(ip: string) {
  banCache.set(ip, Date.now());
}

/**
 * Validates the session token from the analytics_session cookie.
 * Token format: `timestamp.signature`
 * Uses Web Crypto API (Edge-compatible).
 */
async function isValidSession(token: string): Promise<boolean> {
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const ts = parseInt(timestamp, 10);

  // Check token age
  if (isNaN(ts) || Date.now() - ts > MAX_AGE_MS) {
    return false;
  }

  // Verify HMAC signature using Web Crypto API
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(timestamp));
  const expectedSignature = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return signature === expectedSignature;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Ban check for login-related routes ──
  if (pathname === "/login" || pathname === "/api/auth/login") {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    if (ip !== "unknown" && (await isIpBanned(ip))) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "This IP has been permanently banned due to too many failed login attempts.",
            banned: true,
          },
          { status: 403 }
        );
      }
      // For the login page, let it load but the UI will handle showing the ban state
      // We pass a header so the page can detect ban status
      const response = NextResponse.next();
      response.headers.set("x-banned", "true");
      return response;
    }
  }

  // Allow public routes — no auth required
  if (
    pathname.startsWith("/api/collect") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/config") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/v1") ||
    pathname.startsWith("/api/sites") ||
    pathname.startsWith("/api/debug") ||
    pathname === "/login" ||
    pathname === "/" ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/t.js") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Protect /dashboard/* pages and /api/dashboard/* API routes
  const isProtectedApi = pathname.startsWith("/api/dashboard");
  const isProtectedPage = pathname.startsWith("/dashboard");

  if (isProtectedApi || isProtectedPage) {
    const sessionCookie = request.cookies.get(COOKIE_NAME);

    if (!sessionCookie || !(await isValidSession(sessionCookie.value))) {
      // API routes: return 401 JSON
      if (isProtectedApi) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        );
      }
      // Page routes: redirect to login
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, *.svg, *.png, *.jpg, *.jpeg, *.gif, *.webp
     * - t.js (tracking script)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|t\\.js).*)",
  ],
};
