import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";
import { db } from "@/lib/db";
import { loginAttempts, bannedLogins } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const COOKIE_NAME = "analytics_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const MAX_ATTEMPTS = 3;

/**
 * Creates an HMAC-signed session token.
 * The token is: `timestamp.signature`
 */
function createSessionToken(): string {
  const secret = process.env.DASHBOARD_PASSWORD!;
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
 * POST /api/auth/login
 *
 * Body: { password: string }
 * On success: sets HTTP-only session cookie and returns 200.
 * On failure: tracks attempt, bans after 3 failures, returns 401/403.
 */
export async function POST(request: NextRequest) {
  const { ip, userAgent } = getClientInfo(request);

  try {
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

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const dashboardPassword = process.env.DASHBOARD_PASSWORD;

    if (!dashboardPassword) {
      console.error("DASHBOARD_PASSWORD env var is not set");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // ── Step 2: Check password ──
    if (password !== dashboardPassword) {
      // Upsert login attempt
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
