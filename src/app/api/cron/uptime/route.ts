import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, uptimeChecks } from "@/lib/db/schema";
import { isPrivateUrl } from "@/lib/ssrf";

export async function GET(request: NextRequest) {
  // VULN-003 FIX: Fail-closed auth — require CRON_SECRET, block if not set
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const allSites = await db.select({ id: sites.id, domain: sites.domain }).from(sites);
    let checkedCount = 0;
    let skippedCount = 0;

    for (const site of allSites) {
      if (!site.domain) continue;
      const url = site.domain.startsWith("http")
        ? site.domain
        : `https://${site.domain}`;

      // VULN-013 FIX: Validate URL before making requests
      if (isPrivateUrl(url)) {
        console.warn(`[cron/uptime] Skipping private/internal URL: ${url}`);
        skippedCount++;
        continue;
      }

      const start = Date.now();
      let status = "down";
      try {
        const res = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          redirect: "manual", // Don't follow redirects to potentially internal URLs
        });
        status = res.ok ? "up" : "degraded";
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

    return NextResponse.json({
      success: true,
      checked: checkedCount,
      skipped: skippedCount,
    });
  } catch (error) {
    console.error("[cron/uptime] GET Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
