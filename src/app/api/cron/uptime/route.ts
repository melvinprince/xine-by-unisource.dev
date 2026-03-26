import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, uptimeChecks } from "@/lib/db/schema";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allSites = await db.select().from(sites);
    let checkedCount = 0;

    for (const site of allSites) {
      if (!site.domain) continue;
      const url = site.domain.startsWith('http') ? site.domain : `https://${site.domain}`;
      
      const start = Date.now();
      let status = 'down';
      try {
        const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        status = res.ok ? 'up' : 'degraded';
      } catch {
        // Site unreachable — status stays 'down'
      }
      const responseTime = Date.now() - start;

      await db.insert(uptimeChecks).values({
        site_id: site.id,
        url,
        status,
        response_time: responseTime,
      });
      checkedCount++;
    }

    return NextResponse.json({ success: true, checked: checkedCount });
  } catch (error) {
    console.error("[cron/uptime] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
