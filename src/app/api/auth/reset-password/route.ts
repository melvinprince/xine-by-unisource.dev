import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { passwordResetOtps, users } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { compareSync, hashSync } from "bcryptjs";
import { resetPasswordSchema, validateOrThrow } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let data;
    try {
      data = validateOrThrow(resetPasswordSchema, body);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    const { email, otp, newPassword } = data;

    // Fetch user
    const userResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const user = userResult[0];

    if (!user || !user.is_active) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    // Get active OTPs
    const otps = await db
      .select()
      .from(passwordResetOtps)
      .where(
        and(
          eq(passwordResetOtps.user_id, user.id),
          eq(passwordResetOtps.used, false),
          gt(passwordResetOtps.expires_at, new Date())
        )
      )
      .orderBy(passwordResetOtps.created_at);

    let validOtpId: string | null = null;

    for (const otpRecord of otps) {
      if (compareSync(otp, otpRecord.otp_hash)) {
        validOtpId = otpRecord.id;
        break;
      }
    }

    if (!validOtpId) {
      return NextResponse.json({ error: "Invalid or expired OTP" }, { status: 400 });
    }

    // Update password
    const newPasswordHash = hashSync(newPassword, 12);

    await db
      .update(users)
      .set({ password_hash: newPasswordHash, updated_at: new Date() })
      .where(eq(users.id, user.id));

    // Mark OTP as used
    await db
      .update(passwordResetOtps)
      .set({ used: true })
      .where(eq(passwordResetOtps.id, validOtpId));

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
