import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getUserFromRequest } from "@/lib/api-helpers";
import { validateOrThrow, ValidationError } from "@/lib/validation";
import { generateApiToken } from "@/lib/mcp/tokens";

const MAX_TOKENS_PER_USER = 20;

const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

/**
 * GET /api/dashboard/tokens — List the current user's API tokens (never the token itself).
 */
export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        token_prefix: apiTokens.token_prefix,
        last_used_at: apiTokens.last_used_at,
        expires_at: apiTokens.expires_at,
        created_at: apiTokens.created_at,
      })
      .from(apiTokens)
      .where(eq(apiTokens.user_id, userId))
      .orderBy(desc(apiTokens.created_at));

    return NextResponse.json(rows);
  } catch (error) {
    console.error("Error fetching API tokens:", error);
    return NextResponse.json({ error: "Failed to fetch tokens" }, { status: 500 });
  }
}

/**
 * POST /api/dashboard/tokens — Create a new API token.
 * The raw token is returned exactly once; only its hash is stored.
 */
export async function POST(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const { name, expiresInDays } = validateOrThrow(createTokenSchema, body);

    const countRes = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(apiTokens)
      .where(eq(apiTokens.user_id, userId));
    if ((countRes[0]?.count ?? 0) >= MAX_TOKENS_PER_USER) {
      return NextResponse.json(
        { error: `Token limit reached (${MAX_TOKENS_PER_USER}). Revoke an unused token first.` },
        { status: 400 }
      );
    }

    const { token, hash, prefix } = generateApiToken();
    const expires_at = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const result = await db
      .insert(apiTokens)
      .values({
        user_id: userId,
        name,
        token_hash: hash,
        token_prefix: prefix,
        expires_at,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        token_prefix: apiTokens.token_prefix,
        expires_at: apiTokens.expires_at,
        created_at: apiTokens.created_at,
      });

    // `token` is only ever returned here — it cannot be retrieved again
    return NextResponse.json({ ...result[0], token }, { status: 201 });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating API token:", error);
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}
