import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { passwordResetOtps, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashSync } from "bcryptjs";
import { forgotPasswordSchema, validateOrThrow } from "@/lib/validation";
import { sendOtpEmail } from "@/lib/email";

// Simple rate limit in memory (in a real app, use redis or db)
const rateLimits = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let data;
    try {
      data = validateOrThrow(forgotPasswordSchema, body);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const { email } = data;

    // Rate limit: max 3 per hour
    const now = Date.now();
    const attempts = rateLimits.get(email) || [];
    const recentAttempts = attempts.filter((ts) => now - ts < 60 * 60 * 1000);
    if (recentAttempts.length >= 3) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
    recentAttempts.push(now);
    rateLimits.set(email, recentAttempts);

    // Fetch user
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = userResult[0];

    if (user && user.is_active) {
      // Generate OTP
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = hashSync(otp, 10);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

      await db.insert(passwordResetOtps).values({
        user_id: user.id,
        otp_hash: otpHash,
        expires_at: expiresAt,
      });

      // Send email
      await sendOtpEmail(email, otp, user.name);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
