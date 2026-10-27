// ============================================================
// Xine — MCP Authorization Helpers
// Maps the authenticated token user onto site access + roles
// (same userSites model the dashboard uses).
// ============================================================

import { db } from "@/lib/db";
import { userSites, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getUserAccessibleSiteIds } from "@/lib/api-helpers";

export type SiteRole = "viewer" | "editor" | "owner";

const ROLE_RANK: Record<SiteRole, number> = { viewer: 0, editor: 1, owner: 2 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Error type for expected tool failures. The message is shown to the
 * MCP client as-is, so make it actionable.
 */
export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

export function toolError(message: string): never {
  throw new McpToolError(message);
}

/**
 * Verify the user can access a site with at least `minRole`.
 * Returns the user's actual role on the site.
 */
export async function requireSiteAccess(
  userId: string,
  siteId: string,
  minRole: SiteRole = "viewer"
): Promise<SiteRole> {
  if (!UUID_RE.test(siteId)) {
    toolError(`Invalid site_id "${siteId}". Pass a site UUID — call xine_list_sites to see your sites.`);
  }

  const rows = await db
    .select({ role: userSites.role })
    .from(userSites)
    .where(and(eq(userSites.user_id, userId), eq(userSites.site_id, siteId)))
    .limit(1);

  if (rows.length === 0) {
    toolError("Site not found or you don't have access to it. Call xine_list_sites to see available sites.");
  }

  const role = (rows[0].role || "viewer") as SiteRole;
  if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
    toolError(`This action requires the "${minRole}" role on the site; your role is "${role}".`);
  }
  return role;
}

/**
 * Resolve a site_id argument ("all" or a UUID) into the site scope
 * accepted by the query layer. "all" expands to every site the user
 * can access — never to other users' sites.
 */
export async function resolveSiteScope(userId: string, siteId: string): Promise<string[]> {
  if (siteId === "all") {
    return getUserAccessibleSiteIds(userId);
  }
  await requireSiteAccess(userId, siteId, "viewer");
  return [siteId];
}

export interface AccountInfo {
  id: string;
  email: string;
  name: string;
  role: string | null;
  is_active: boolean | null;
}

/** Load the authenticated user's own account row. */
export async function getAccount(userId: string): Promise<AccountInfo> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      is_active: users.is_active,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (rows.length === 0) toolError("Your user account no longer exists.");
  return rows[0];
}

/**
 * Gate for tools that reach past a single site's analytics — platform-wide
 * security logs and the raw SQL console.
 *
 * Allowed for a platform admin, or for a user who owns every site they can
 * see (the single-operator self-hosted case). A teammate who was merely
 * granted viewer/editor access to someone's site gets nothing extra.
 */
export async function requireFullDataAccess(userId: string): Promise<AccountInfo> {
  const account = await getAccount(userId);
  if (account.role === "admin") return account;

  const rows = await db.select({ role: userSites.role }).from(userSites).where(eq(userSites.user_id, userId));
  if (rows.length > 0 && rows.every((r) => r.role === "owner")) return account;

  toolError(
    'This tool needs full-account access: either the platform "admin" role, or ownership of every site on your account.'
  );
}
