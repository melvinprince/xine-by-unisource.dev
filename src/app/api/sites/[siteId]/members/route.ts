import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userSites, users, sites, siteInvites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest, verifyUserSiteAccess } from "@/lib/api-helpers";
import { validateOrThrow, addMemberSchema, ValidationError } from "@/lib/validation";
import { randomBytes } from "crypto";
import { sendInviteEmail } from "@/lib/email";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await params;
  
  const hasAccess = await verifyUserSiteAccess(userId, siteId);
  if (!hasAccess) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  try {
    const members = await db
      .select({
        id: userSites.id,
        user_id: userSites.user_id,
        role: userSites.role,
        email: users.email,
        name: users.name,
        created_at: userSites.granted_at,
      })
      .from(userSites)
      .innerJoin(users, eq(userSites.user_id, users.id))
      .where(eq(userSites.site_id, siteId));

    const pendingInvites = await db
      .select({
        id: siteInvites.id,
        email: siteInvites.email,
        role: siteInvites.role,
        created_at: siteInvites.created_at,
        expires_at: siteInvites.expires_at,
      })
      .from(siteInvites)
      .where(eq(siteInvites.site_id, siteId));

    return NextResponse.json({ members, pendingInvites });
  } catch (error) {
    console.error("Error fetching site members:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const currentUserId = getUserFromRequest(request);
  if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId } = await params;

  // Verify the current user is an owner of this site
  const currentUserAccess = await db
    .select({ role: userSites.role })
    .from(userSites)
    .where(and(eq(userSites.user_id, currentUserId), eq(userSites.site_id, siteId)))
    .limit(1);

  if (currentUserAccess.length === 0) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (currentUserAccess[0].role !== "owner") {
    return NextResponse.json({ error: "Only site owners can add members" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { email, role } = validateOrThrow(addMemberSchema, body);

    // Find the user to add
    const targetUserResult = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (targetUserResult.length === 0) {
      // User does not exist, create an invitation
      const existingInvite = await db
        .select()
        .from(siteInvites)
        .where(and(eq(siteInvites.email, email), eq(siteInvites.site_id, siteId)))
        .limit(1);

      if (existingInvite.length > 0) {
        return NextResponse.json({ error: "User has already been invited to this site" }, { status: 400 });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

      await db.insert(siteInvites).values({
        site_id: siteId,
        email,
        role: role as "owner" | "editor" | "viewer",
        token,
        invited_by: currentUserId,
        expires_at: expiresAt,
      });

      const siteInfo = await db.select({ name: sites.name }).from(sites).where(eq(sites.id, siteId)).limit(1);
      const inviterInfo = await db.select({ name: users.name }).from(users).where(eq(users.id, currentUserId)).limit(1);

      const siteName = siteInfo[0]?.name || "a website";
      const inviterName = inviterInfo[0]?.name || "A user";

      await sendInviteEmail(email, token, siteName, inviterName);

      return NextResponse.json({ success: true, message: "Invitation sent" }, { status: 201 });
    }

    const targetUser = targetUserResult[0];

    // Check if they are already a member
    const existingMember = await db
      .select({ id: userSites.id })
      .from(userSites)
      .where(and(eq(userSites.user_id, targetUser.id), eq(userSites.site_id, siteId)))
      .limit(1);

    if (existingMember.length > 0) {
      return NextResponse.json({ error: "User is already a member of this site" }, { status: 400 });
    }

    // Add them
    await db.insert(userSites).values({
      user_id: targetUser.id,
      site_id: siteId,
      role: role as "owner" | "editor" | "viewer",
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error adding site member:", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
