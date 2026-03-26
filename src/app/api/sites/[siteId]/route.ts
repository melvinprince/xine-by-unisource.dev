import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/sites/[siteId] — Delete a site and cascade all its data.
 *
 * The ON DELETE CASCADE in the schema handles removing pageviews + events.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  if (!siteId) {
    return NextResponse.json(
      { error: "Site ID is required" },
      { status: 400 }
    );
  }

  // Verify site exists
  const existing = await db
    .select({ id: sites.id })
    .from(sites)
    .where(eq(sites.id, siteId))
    .limit(1);

  if (existing.length === 0) {
    return NextResponse.json(
      { error: "Site not found" },
      { status: 404 }
    );
  }

  try {
    await db.delete(sites).where(eq(sites.id, siteId));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting site:", error);
    return NextResponse.json(
      { error: "Failed to delete site" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/sites/[siteId] — Update a site's name or domain.
 *
 * Body: { name?: string, domain?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  const { siteId } = await params;

  if (!siteId) {
    return NextResponse.json(
      { error: "Site ID is required" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const updates: Record<string, any> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.domain !== undefined) {
      updates.domain = body.domain
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
    }
    if (body.is_public !== undefined) updates.is_public = body.is_public === true;
    if (body.api_access_enabled !== undefined) updates.api_access_enabled = body.api_access_enabled === true;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update. Provide name or domain." },
        { status: 400 }
      );
    }

    const result = await db
      .update(sites)
      .set(updates)
      .where(eq(sites.id, siteId))
      .returning();

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Site not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...result[0],
      created_at: new Date(result[0].created_at).toISOString(),
    });
  } catch (error: unknown) {
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A site with this domain already exists" },
        { status: 409 }
      );
    }
    console.error("Error updating site:", error);
    return NextResponse.json(
      { error: "Failed to update site" },
      { status: 500 }
    );
  }
}
