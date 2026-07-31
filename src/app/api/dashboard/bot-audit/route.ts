import { NextRequest, NextResponse } from "next/server";
import { getBotBreakdown } from "@/lib/queries-advanced";
import {
  verifySiteExists,
  parseDateRange,
  siteNotFoundResponse,
  invalidDateResponse,
  getUserFromRequest,
  getUserAccessibleSiteIds,
} from "@/lib/api-helpers";

/**
 * GET /api/dashboard/bot-audit — What the bot filter flagged, and why.
 *
 * Traffic is flagged rather than discarded (see src/lib/bot-detection.ts), so
 * this is the feedback loop for tuning: if a reason bucket is larger than
 * expected, pull the underlying rows with
 * /api/sites/{siteId}/export?include_bots=1 and check them before adjusting
 * any weight.
 */
export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const exists = await verifySiteExists(siteId, request);
    if (!exists) return siteNotFoundResponse();

    const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;

    const dateRange = parseDateRange(from, to);
    if (!dateRange) return invalidDateResponse();

    const data = await getBotBreakdown(targetSiteId, dateRange);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error("[bot-audit] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
