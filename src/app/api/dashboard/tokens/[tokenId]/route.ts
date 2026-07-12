import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserFromRequest } from "@/lib/api-helpers";
import { validateOrThrow, uuidSchema, ValidationError } from "@/lib/validation";

/**
 * DELETE /api/dashboard/tokens/[tokenId] — Revoke (delete) an API token.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rawParams = await params;
    const tokenId = validateOrThrow(uuidSchema, rawParams.tokenId);

    const deleted = await db
      .delete(apiTokens)
      .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.user_id, userId)))
      .returning({ id: apiTokens.id });

    if (deleted.length === 0) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error deleting API token:", error);
    return NextResponse.json({ error: "Failed to delete token" }, { status: 500 });
  }
}
