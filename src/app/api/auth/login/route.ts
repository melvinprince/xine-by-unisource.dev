import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginAttempts, bannedLogins, users } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { compareSync } from "bcryptjs";
import { createHmac } from "crypto";
import { loginSchema, validateOrThrow } from "@/lib/validation";

const COOKIE_NAME = "analytics_session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day
const MAX_ATTEMPTS = 5; // Per IP+UA+Email
const GLOBAL_MAX_ATTEMPTS = 20;
const GLOBAL_WINDOW_MS = 15 * 60 * 1000;

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "default_secret_please_change_in_production";
}

function createSessionToken(userId: string): string {
  const secret = getSessionSecret();
  const timestamp = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(`${userId}:${timestamp}`)
    .digest("hex");
  return `${userId}:${timestamp}.${signature}`;
}

function getClientInfo(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return { ip, userAgent };
}

const globalAttemptLog: { ts: number }[] = [];

function isGloballyRateLimited(): boolean {
  const now = Date.now();
  while (globalAttemptLog.length > 0 && now - globalAttemptLog[0].ts > GLOBAL_WINDOW_MS) {
    globalAttemptLog.shift();
  }
  return globalAttemptLog.length >= GLOBAL_MAX_ATTEMPTS;
}

function recordGlobalAttempt() {
  globalAttemptLog.push({ ts: Date.now() });
}

export async function POST(request: NextRequest) {
  const { ip, userAgent } = getClientInfo(request);

  try {
    if (isGloballyRateLimited()) {
      return NextResponse.json(
        { error: "Too many login attempts globally. Please try again later.", rateLimited: true },
        { status: 429 }
      );
    }

    const existingBan = await db
      .select({ id: bannedLogins.id })
      .from(bannedLogins)
      .where(and(eq(bannedLogins.ip, ip), eq(bannedLogins.user_agent, userAgent)))
      .limit(1);

    if (existingBan.length > 0) {
      return NextResponse.json(
        { error: "This device has been permanently banned due to too many failed login attempts.", banned: true },
        { status: 403 }
      );
    }

    const body = await request.json();
    let data;
    try {
      data = validateOrThrow(loginSchema, body);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const { email, password } = data;

    // Fetch user
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = userResult[0];
    
    // Constant time logic placeholder for user not found vs invalid password
    let isValid = false;
    if (user && user.is_active) {
      isValid = compareSync(password, user.password_hash);
    } else {
      compareSync(password, "$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01");
    }

    if (!isValid) {
      recordGlobalAttempt();

      const existing = await db
        .select()
        .from(loginAttempts)
        .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.user_agent, userAgent), eq(loginAttempts.email, email)))
        .limit(1);

      let currentAttempts = 1;

      if (existing.length > 0) {
        currentAttempts = existing[0].attempts + 1;
        await db
          .update(loginAttempts)
          .set({ attempts: currentAttempts, last_attempt_at: new Date() })
          .where(eq(loginAttempts.id, existing[0].id));
      } else {
        await db.insert(loginAttempts).values({ ip, user_agent: userAgent, email, attempts: 1 });
      }

      if (currentAttempts >= MAX_ATTEMPTS) {
        await db.insert(bannedLogins).values({
          ip, user_agent: userAgent, reason: `Exceeded ${MAX_ATTEMPTS} failed login attempts for ${email}`,
        });

        return NextResponse.json(
          { error: "Too many failed attempts. This device has been permanently banned.", banned: true, remaining_attempts: 0 },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: "Invalid email or password", remaining_attempts: MAX_ATTEMPTS - currentAttempts },
        { status: 401 }
      );
    }

    // Successful login — clear attempts
    await db
      .delete(loginAttempts)
      .where(and(eq(loginAttempts.ip, ip), eq(loginAttempts.user_agent, userAgent)));

    const token = createSessionToken(user.id);

    const response = NextResponse.json(
      { 
        success: true, 
        user: { id: user.id, email: user.email, name: user.name, role: user.role } 
      },
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
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
