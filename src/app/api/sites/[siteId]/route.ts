import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { validateOrThrow, updateSiteSchema, uuidSchema, ValidationError } from "@/lib/validation";

/**
 * DELETE /api/sites/[siteId] — Delete a site and cascade all its data.
 *
 * The ON DELETE CASCADE in the schema handles removing pageviews + events.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  let siteId: string;
  try {
    const parsedParams = await params;
    siteId = validateOrThrow(uuidSchema, parsedParams.siteId);
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid Site ID format" },
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
 * Body: { name?: string, domain?: string, is_public?: boolean, api_access_enabled?: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ siteId: string }> }
) {
  let siteId: string;
  try {
    const parsedParams = await params;
    siteId = validateOrThrow(uuidSchema, parsedParams.siteId);
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid Site ID format" },
      { status: 400 }
    );
  }

  try {
    const body = await request.json();
    const validated = validateOrThrow(updateSiteSchema, body);
    const updates: Record<string, unknown> = {};

    if (validated.name !== undefined) {
      updates.name = validated.name;
    }
    if (validated.domain !== undefined) {
      updates.domain = validated.domain
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
    }
    if (validated.is_public !== undefined) {
      updates.is_public = validated.is_public;
    }
    if (validated.api_access_enabled !== undefined) {
      updates.api_access_enabled = validated.api_access_enabled;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update." },
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
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
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
