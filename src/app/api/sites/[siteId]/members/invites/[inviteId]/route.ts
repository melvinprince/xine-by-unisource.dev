import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userSites, siteInvites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest, verifyUserSiteAccess } from "@/lib/api-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; inviteId: string }> }
) {
  const currentUserId = getUserFromRequest(request);
  if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId, inviteId } = await params;

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
    return NextResponse.json({ error: "Only site owners can revoke invites" }, { status: 403 });
  }

  try {
    const deleted = await db
      .delete(siteInvites)
      .where(and(eq(siteInvites.id, inviteId), eq(siteInvites.site_id, siteId)))
      .returning();

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Invite not found" }, { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error revoking invite:", error);
    return NextResponse.json({ error: "Failed to revoke invite" }, { status: 500 });
  }
}
