import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bannedLogins, loginAttempts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/dashboard/banned-logins
 * Returns all permanently banned IPs/devices.
 */
export async function GET() {
  try {
    const bans = await db
      .select()
      .from(bannedLogins)
      .orderBy(bannedLogins.banned_at);

    return NextResponse.json(bans);
  } catch (error) {
    console.error("Failed to fetch banned logins:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dashboard/banned-logins?id=<uuid>
 * Removes a ban entry and clears associated login attempts.
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing ban ID" }, { status: 400 });
    }

    // Get the ban details first so we can also clear login_attempts
    const ban = await db
      .select()
      .from(bannedLogins)
      .where(eq(bannedLogins.id, id))
      .limit(1);

    if (ban.length === 0) {
      return NextResponse.json({ error: "Ban not found" }, { status: 404 });
    }

    // Delete the ban
    await db.delete(bannedLogins).where(eq(bannedLogins.id, id));

    // Also clear any login attempts for this IP+UA so they get fresh tries
    await db
      .delete(loginAttempts)
      .where(eq(loginAttempts.ip, ban[0].ip));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to remove ban:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
