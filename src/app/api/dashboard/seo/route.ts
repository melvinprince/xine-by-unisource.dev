import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getSeoOverview } from "@/lib/queries-advanced";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const rangeStr = searchParams.get("range") || "30d";

    if (!siteId) {
      return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
    }

    let from: Date;
    const to = new Date();

    // Support both presets (24h, 7d, 30d) and timestamp ranges (from-to)
    if (rangeStr.includes("-") && !rangeStr.endsWith("d") && !rangeStr.endsWith("h")) {
      const [fromTs, toTs] = rangeStr.split("-").map(Number);
      from = new Date(fromTs);
      if (toTs) {
        to.setTime(toTs);
      }
    } else {
      from = new Date();
      switch (rangeStr) {
        case "1h": from.setHours(from.getHours() - 1); break;
        case "3h": from.setHours(from.getHours() - 3); break;
        case "12h": from.setHours(from.getHours() - 12); break;
        case "24h": from.setHours(from.getHours() - 24); break;
        case "7d": from.setDate(from.getDate() - 7); break;
        case "90d": from.setDate(from.getDate() - 90); break;
        case "30d":
        default:
          from.setDate(from.getDate() - 30);
          break;
      }
    }

    if (siteId !== "all") {
      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });

      if (!site) {
        return NextResponse.json({ error: "Site not found" }, { status: 404 });
      }
    }

    const data = await getSeoOverview(siteId, { from, to });
    return NextResponse.json(data);
  } catch (error) {
    console.error("[api/dashboard/seo] GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 }
    );
  }
}
