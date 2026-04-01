import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginAttempts, bannedLogins } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { compareSync } from "bcryptjs";
import { createHmac } from "crypto";

const COOKIE_NAME = "analytics_session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day (reduced from 7 for security)
const MAX_ATTEMPTS = 5; // Per IP+UA
const GLOBAL_MAX_ATTEMPTS = 20; // VULN-006 FIX: Global attempt limit
const GLOBAL_WINDOW_MS = 15 * 60 * 1000; // 15-minute window

/**
 * Gets the session signing secret.
 * VULN-005 FIX: Uses SESSION_SECRET if set, falls back to DASHBOARD_PASSWORD.
 */
function getSessionSecret(): string {
  return process.env.SESSION_SECRET || process.env.DASHBOARD_PASSWORD!;
}

/**
 * Creates an HMAC-signed session token.
 * VULN-005 FIX: Uses separate SESSION_SECRET instead of password.
 */
function createSessionToken(): string {
  const secret = getSessionSecret();
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

function getClientInfo(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return { ip, userAgent };
}

/**
 * VULN-006 FIX: Global rate limiter that cannot be bypassed by rotating IP/UA.
 */
const globalAttemptLog: { ts: number }[] = [];

function isGloballyRateLimited(): boolean {
  const now = Date.now();
  // Remove old entries outside the window
  while (globalAttemptLog.length > 0 && now - globalAttemptLog[0].ts > GLOBAL_WINDOW_MS) {
    globalAttemptLog.shift();
  }
  return globalAttemptLog.length >= GLOBAL_MAX_ATTEMPTS;
}

function recordGlobalAttempt() {
  globalAttemptLog.push({ ts: Date.now() });
}

/**
 * VULN-004 FIX: Validates password using bcrypt or constant-time comparison.
 * If DASHBOARD_PASSWORD_HASH is set, uses bcrypt comparison.
 * Otherwise falls back to timing-safe comparison against DASHBOARD_PASSWORD.
 */
function verifyPassword(submitted: string): boolean {
  const hash = process.env.DASHBOARD_PASSWORD_HASH;
  if (hash) {
    // Preferred: bcrypt hash comparison (constant-time by design)
    return compareSync(submitted, hash);
  }

  // Fallback: timing-safe comparison against plaintext DASHBOARD_PASSWORD
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;

  // Constant-time comparison
  if (submitted.length !== password.length) {
    // Compare against a dummy to maintain constant time even on length mismatch
    compareSync(submitted, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01");
    return false;
  }

  const encoder = new TextEncoder();
  const a = encoder.encode(submitted);
  const b = encoder.encode(password);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

/**
 * POST /api/auth/login
 *
 * Body: { password: string }
 * On success: sets HTTP-only session cookie and returns 200.
 * On failure: tracks attempt, bans after N failures, returns 401/403.
 */
export async function POST(request: NextRequest) {
  const { ip, userAgent } = getClientInfo(request);

  try {
    // VULN-006 FIX: Check global rate limit first
    if (isGloballyRateLimited()) {
      return NextResponse.json(
        {
          error: "Too many login attempts globally. Please try again later.",
          rateLimited: true,
        },
        { status: 429 }
      );
    }

    // ── Step 1: Check if IP or device is already banned ──
    const existingBan = await db
      .select({ id: bannedLogins.id })
      .from(bannedLogins)
      .where(and(eq(bannedLogins.ip, ip), eq(bannedLogins.user_agent, userAgent)))
      .limit(1);

    if (existingBan.length > 0) {
      return NextResponse.json(
        {
          error: "This device has been permanently banned due to too many failed login attempts.",
          banned: true,
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { password } = body;

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    // VULN-009 (related): Limit password length to prevent DoS via bcrypt
    if (password.length > 128) {
      return NextResponse.json(
        { error: "Password too long" },
        { status: 400 }
      );
    }

    const dashboardPassword = process.env.DASHBOARD_PASSWORD;
    const dashboardPasswordHash = process.env.DASHBOARD_PASSWORD_HASH;

    if (!dashboardPassword && !dashboardPasswordHash) {
      console.error("Neither DASHBOARD_PASSWORD nor DASHBOARD_PASSWORD_HASH env var is set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // ── Step 2: Check password (VULN-004 FIX: bcrypt or timing-safe) ──
    if (!verifyPassword(password)) {
      // Record global attempt
      recordGlobalAttempt();

      // Upsert per-IP login attempt
      const existing = await db
        .select()
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.user_agent, userAgent)))
        .limit(1);

      let currentAttempts = 1;

      if (existing.length > 0) {
        currentAttempts = existing[0].attempts + 1;
        await db
          .update(loginAttempts)
          .set({
            attempts: currentAttempts,
            last_attempt_at: new Date(),
          })
          .where(eq(loginAttempts.id, existing[0].id));
      } else {
        await db.insert(loginAttempts).values({
          ip,
          user_agent: userAgent,
          attempts: 1,
        });
      }

      // ── Step 3: Ban if max attempts reached ──
      if (currentAttempts >= MAX_ATTEMPTS) {
        await db.insert(bannedLogins).values({
          ip,
          user_agent: userAgent,
          reason: `Exceeded ${MAX_ATTEMPTS} failed login attempts`,
        });

        return NextResponse.json(
          {
            error: "Too many failed attempts. This device has been permanently banned.",
            banned: true,
            remaining_attempts: 0,
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        {
          error: "Invalid password",
          remaining_attempts: MAX_ATTEMPTS - currentAttempts,
        },
        { status: 401 }
      );
    }

    // ── Step 4: Successful login — clear attempts ──
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.user_agent, userAgent)));

    const token = createSessionToken();

    const response = NextResponse.json(
      { success: true },
      { status: 200 }
    );

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
