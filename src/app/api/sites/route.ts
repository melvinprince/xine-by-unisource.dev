import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { randomUUID } from "crypto";

/**
 * GET /api/sites — List all tracked sites.
 */
export async function GET() {
  try {
    // Now protected by proxy.ts auth — safe to return all fields
    const data = await db
      .select()
      .from(sites)
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
  try {
    const body = await request.json();
    const { name, domain } = body;

    if (!name || !domain) {
      return NextResponse.json(
        { error: "Name and domain are required" },
        { status: 400 }
      );
    }

    // Clean domain (remove protocol if provided)
    const cleanDomain = domain
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");

    // Auto-generate API key
    const apiKey = randomUUID();

    const result = await db
      .insert(sites)
      .values({
        name,
        domain: cleanDomain,
        api_key: apiKey,
        user_id: 'admin',
        server_api_key: randomUUID(),
      })
      .returning();

    return NextResponse.json(
      {
        ...result[0],
        created_at: new Date(result[0].created_at).toISOString(),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
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
