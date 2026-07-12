// ============================================================
// Xine — API Token Utilities
// Personal access tokens (PATs) for the MCP endpoint (/api/mcp).
// Raw tokens are never stored — only a sha256 hash.
// ============================================================

import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { apiTokens, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const TOKEN_PREFIX = "xine_";

// How often we persist last_used_at (avoids a write on every MCP request)
const LAST_USED_UPDATE_INTERVAL_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a new API token. The raw token is returned once and never stored.
 */
export function generateApiToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(24).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

export interface VerifiedToken {
  tokenId: string;
  userId: string;
}

/**
 * Verify a raw bearer token. Returns the owning user if the token exists,
 * hasn't expired, and the user account is still active.
 */
export async function verifyApiToken(rawToken: string): Promise<VerifiedToken | null> {
  if (!rawToken || !rawToken.startsWith(TOKEN_PREFIX)) return null;

  const rows = await db
    .select({
      id: apiTokens.id,
      user_id: apiTokens.user_id,
      expires_at: apiTokens.expires_at,
      last_used_at: apiTokens.last_used_at,
      user_active: users.is_active,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.user_id, users.id))
    .where(eq(apiTokens.token_hash, hashToken(rawToken)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.expires_at && row.expires_at < new Date()) return null;
  if (row.user_active === false) return null;

  if (!row.last_used_at || Date.now() - row.last_used_at.getTime() > LAST_USED_UPDATE_INTERVAL_MS) {
    // Fire-and-forget bookkeeping — must never block or fail auth
    db.update(apiTokens)
      .set({ last_used_at: new Date() })
      .where(eq(apiTokens.id, row.id))
      .catch((error) => console.error("[mcp] failed to update token last_used_at:", error));
  }

  return { tokenId: row.id, userId: row.user_id };
}
