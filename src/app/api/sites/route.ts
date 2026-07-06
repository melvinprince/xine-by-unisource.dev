import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, userSites } from "@/lib/db/schema";
import { desc, inArray, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

import { validateOrThrow, createSiteSchema, ValidationError } from "@/lib/validation";
import { getUserFromRequest, getUserAccessibleSiteIds } from "@/lib/api-helpers";

/**
 * GET /api/sites — List all tracked sites.
 */
export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const accessibleSites = await getUserAccessibleSiteIds(userId);
    if (accessibleSites.length === 0) {
      return NextResponse.json([]);
    }

    const data = await db
      .select()
      .from(sites)
      .where(inArray(sites.id, accessibleSites))
      .orderBy(desc(sites.created_at));

    return NextResponse.json(
      data.map((row) => ({
        ...row,
        created_at: new Date(row.created_at).toISOString(),
      }))
    );
  } catch (error) {
    console.error("Error fetching sites:", error);
    return NextResponse.json(
      { error: "Failed to fetch sites" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sites — Create a new site.
 *
 * Body: { name: string, domain: string }
 * Auto-generates a unique API key.
 */
export async function POST(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  
  try {
    const body = await request.json();
    const validated = validateOrThrow(createSiteSchema, body);
    const { name, domain } = validated;

    // Clean domain (remove protocol if provided)
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    // Auto-generate API key
    const apiKey = randomUUID();

    const result = await db.transaction(async (tx) => {
      const siteRes = await tx
        .insert(sites)
        .values({
          name,
          domain: cleanDomain,
          api_key: apiKey,
          server_api_key: randomUUID(),
          owner_id: userId,
          user_id: userId,
        })
        .returning();

      await tx.insert(userSites).values({
        user_id: userId,
        site_id: siteRes[0].id,
        role: "owner",
      });

      return siteRes;
    });

    return NextResponse.json(
      {
        ...result[0],
        created_at: new Date(result[0].created_at).toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    // Handle duplicate domain
    const pgError = error as { code?: string };
    if (pgError.code === "23505") {
      return NextResponse.json(
        { error: "A site with this domain already exists" },
        { status: 409 }
      );
    }
    console.error("Error creating site:", error);
    return NextResponse.json(
      { error: "Failed to create site" },
      { status: 500 }
    );
  }
}
