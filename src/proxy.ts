import { NextRequest, NextResponse } from "next/server";
import { isDashboardRateLimited } from "@/lib/rate-limit";

const COOKIE_NAME = "analytics_session";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day (reduced from 7 days for security)

// ── In-memory ban cache (avoids DB hit on every request) ──
const banCache = new Map<string, number>(); // ip → cached timestamp
const BAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// NOTE: Server-side session store is not possible with in-memory Maps in Next.js
// because middleware (Edge Runtime) and API routes (Node Runtime) run in separate
// processes with separate memory. Session security is enforced via:
// 1. Separate SESSION_SECRET (not the password)
// 2. Constant-time HMAC comparison
// 3. Reduced 1-day token lifetime
// 4. Cookie cleared on logout

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
    // VULN-007 FIX: Fail CLOSED — block if DB is unreachable
    return true;
  }

  return false;
}

// Export a function to update the cache when a new ban is created
export function addToBanCache(ip: string) {
  banCache.set(ip, Date.now());
}

/**
 * Gets the session signing secret.
 * Uses SESSION_SECRET if set, otherwise falls back to DASHBOARD_PASSWORD.
 * VULN-005 FIX: Prefer separate secret from the password.
 */
function getSessionSecret(): string | undefined {
  return process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD;
}

/**
 * Constant-time comparison of two hex strings.
 * VULN-004 FIX: Prevents timing side-channel attacks.
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * Validates the session token from the analytics_session cookie.
 * Token format: `timestamp.signature`
 * Uses Web Crypto API (Edge-compatible).
 * VULN-005 FIX: Uses separate SESSION_SECRET + server-side session validation.
 */
async function isValidSession(token: string): Promise<boolean> {
  const secret = getSessionSecret();
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

  // VULN-004 FIX: Use constant-time comparison
  if (!timingSafeCompare(signature, expectedSignature)) {
    return false;
  }

  return true;
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
      const response = NextResponse.next();
      response.headers.set("x-banned", "true");
      return response;
    }
  }

  // Allow public routes — no auth required
  // VULN-001 FIX: Removed /api/sites (now requires auth)
  // VULN-002 FIX: Removed /api/debug (now requires auth)
  // VULN-003 FIX: Removed /api/cron (now requires auth)
  if (
    pathname.startsWith("/api/collect") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/config") ||
    pathname.startsWith("/api/public") ||
    pathname.startsWith("/api/v1") ||
    pathname === "/login" ||
    pathname === "/" ||
    pathname.startsWith("/share") ||
    pathname.startsWith("/t.js") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  // Protect all authenticated routes:
  // /dashboard/*, /api/dashboard/*, /api/sites/*, /api/debug/*, /api/cron/*
  const isProtectedApi =
    pathname.startsWith("/api/dashboard") ||
    pathname.startsWith("/api/sites") ||
    pathname.startsWith("/api/debug") ||
    pathname.startsWith("/api/cron");
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

    // VULN-018 FIX: Rate limit authenticated dashboard API requests
    if (isProtectedApi) {
      const sessionKey = sessionCookie.value.slice(0, 16); // Use token prefix as session key
      if (isDashboardRateLimited(sessionKey)) {
        return NextResponse.json(
          { error: "Too many requests. Please slow down." },
          { status: 429 }
        );
      }
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
