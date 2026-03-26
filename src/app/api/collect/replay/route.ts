import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, replayEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  getCachedSiteId,
  setCachedSiteId,
  setCachedInvalid,
} from "@/lib/api-key-cache";

function getHeaders(request?: NextRequest) {
  const origin = request?.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    "Timing-Allow-Origin": origin,
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = getHeaders(request);

  try {
    const body = await request.json();
    const { api_key, session_id, url, events } = body;

    if (!api_key || !session_id || !events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400, headers }
      );
    }

    let siteId = getCachedSiteId(api_key);

    if (siteId === undefined) {
      const result = await db
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.api_key, api_key))
        .limit(1);

      if (result.length === 0) {
        setCachedInvalid(api_key);
        return NextResponse.json(
          { error: "Invalid API key" },
          { status: 400, headers }
        );
      }

      siteId = result[0].id;
      setCachedSiteId(api_key, siteId);
    }

    if (siteId === "") {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 400, headers }
      );
    }

    // Fire-and-forget insert
    db.insert(replayEvents)
      .values({
        site_id: siteId,
        session_id,
        url: url || "",
        events: events,
      })
      .catch((err) => {
        console.error("[collect/replay] bg insert error", err);
      });

    return new NextResponse(null, { status: 204, headers });
  } catch (error) {
    console.error("[collect/replay] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers }
    );
  }
}
