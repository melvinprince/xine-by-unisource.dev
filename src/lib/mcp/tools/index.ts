// ============================================================
// Xine MCP — Tool Registry
// ============================================================

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSiteTools } from "./sites";
import { registerAnalyticsTools } from "./analytics";
import { registerGoalFunnelTools } from "./goals-funnels";
import { registerAnnotationTools } from "./annotations";
import { registerMonitoringTools } from "./monitoring";
import { registerRawDataTools } from "./raw-data";
import { registerInsightTools } from "./insights";
import { registerAdminTools } from "./admin";
import { registerSqlTools } from "./sql";

export function registerAllTools(server: McpServer) {
  registerSiteTools(server);
  registerAnalyticsTools(server);
  registerGoalFunnelTools(server);
  registerAnnotationTools(server);
  registerMonitoringTools(server);
  registerRawDataTools(server);
  registerInsightTools(server);
  registerAdminTools(server);
  registerSqlTools(server);
}
