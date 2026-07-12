// ============================================================
// Xine — MCP Server Endpoint (/api/mcp)
// Streamable HTTP MCP server exposing the full analytics
// platform to AI agents. Authenticated with personal API
// tokens (Authorization: Bearer xine_...) created in
// Dashboard → Settings → API Tokens.
// ============================================================

import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { verifyApiToken } from "@/lib/mcp/tokens";
import { registerAllTools } from "@/lib/mcp/tools";

const handler = createMcpHandler(
  (server) => {
    registerAllTools(server);
  },
  {
    serverInfo: { name: "xine-analytics", version: "1.0.0" },
    instructions:
      "Xine is a privacy-first web analytics platform. Start with xine_list_sites to discover the sites you can access and their ids, then use the analytics tools (xine_get_overview, xine_get_breakdown, xine_get_timeseries, ...) with a site UUID or \"all\". Date ranges default to the last 30 days; pass range/from/to to change that. Write tools (create/update/delete) require the editor or owner role on the site.",
  },
  {
    basePath: "/api",
    maxDuration: 60,
    disableSse: true, // stateless streamable HTTP only — no Redis required
  }
);

const verifyToken = async (_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> => {
  if (!bearerToken) return undefined;
  const verified = await verifyApiToken(bearerToken);
  if (!verified) return undefined;
  return {
    token: bearerToken,
    clientId: verified.userId,
    scopes: ["xine:full"],
    extra: { userId: verified.userId, tokenId: verified.tokenId },
  };
};

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
