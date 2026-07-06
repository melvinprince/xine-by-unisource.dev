import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { userSites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/api-helpers";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string; memberId: string }> }
) {
  const currentUserId = getUserFromRequest(request);
  if (!currentUserId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { siteId, memberId } = await params;

  // Verify the current user is an owner of this site
  const currentUserAccess = await db
    .select({ role: userSites.role, id: userSites.id })
    .from(userSites)
    .where(and(eq(userSites.user_id, currentUserId), eq(userSites.site_id, siteId)))
    .limit(1);

  if (currentUserAccess.length === 0) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const isOwner = currentUserAccess[0].role === "owner";
  
  // A user can remove themselves, but only an owner can remove others
  // Wait, memberId in the URL is actually the userSites.id, NOT the user_id. Let's assume it's userSites.id to be safe.
  
  const targetMembership = await db
    .select()
    .from(userSites)
    .where(eq(userSites.id, memberId))
    .limit(1);

  if (targetMembership.length === 0 || targetMembership[0].site_id !== siteId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // Allow if user is owner, OR if the user is removing themselves
  if (!isOwner && targetMembership[0].user_id !== currentUserId) {
    return NextResponse.json({ error: "Only site owners can remove other members" }, { status: 403 });
  }

  // Prevent removing the last owner
  if (targetMembership[0].role === "owner") {
    const ownerCount = await db
      .select({ id: userSites.id })
      .from(userSites)
      .where(and(eq(userSites.site_id, siteId), eq(userSites.role, "owner")));
      
    if (ownerCount.length <= 1) {
      return NextResponse.json({ error: "Cannot remove the last owner of a site" }, { status: 400 });
    }
  }

  try {
    await db.delete(userSites).where(eq(userSites.id, memberId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing site member:", error);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
