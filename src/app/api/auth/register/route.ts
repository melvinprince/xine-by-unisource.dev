import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users, siteInvites, userSites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { hashSync } from "bcryptjs";
import { createHmac } from "crypto";
import { registerSchema, validateOrThrow } from "@/lib/validation";

const COOKIE_NAME = "analytics_session";
const COOKIE_MAX_AGE = 60 * 60 * 24; // 1 day

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = validateOrThrow(registerSchema, body);
    
    // Check if user already exists
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      );
    }

    const hashedPassword = hashSync(data.password, 10);

    // Create user
    const newUserResult = await db
      .insert(users)
      .values({
        email: data.email,
        name: data.name,
        password_hash: hashedPassword,
        role: "user",
        is_active: true,
      })
      .returning();

    const newUser = newUserResult[0];

    // Find and process pending invites
    const pendingInvites = await db
      .select()
      .from(siteInvites)
      .where(eq(siteInvites.email, data.email));

    if (pendingInvites.length > 0) {
      // Insert to user_sites
      const userSitesToInsert = pendingInvites.map(invite => ({
        user_id: newUser.id,
        site_id: invite.site_id,
        role: invite.role as "owner" | "editor" | "viewer",
      }));
      
      await db.insert(userSites).values(userSitesToInsert);

      // Delete processed invites
      for (const invite of pendingInvites) {
        await db.delete(siteInvites).where(eq(siteInvites.id, invite.id));
      }
    }

    const token = createSessionToken(newUser.id);

    const response = NextResponse.json(
      { 
        success: true, 
        user: { id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role } 
      },
      { status: 201 }
    );

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Register error:", error);
    if (error.name === "ValidationError") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
