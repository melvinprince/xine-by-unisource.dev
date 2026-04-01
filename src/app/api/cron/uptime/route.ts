import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, uptimeChecks } from "@/lib/db/schema";

// VULN-013 FIX: Block private/internal IP ranges and reserved hostnames
const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
];

function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    // Block known dangerous hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) return true;

    // Block cloud metadata endpoints
    if (hostname === "169.254.169.254") return true;
    if (hostname.endsWith(".internal")) return true;

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    const parts = hostname.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 0) return true;
    }

    // Block non-HTTP(S) protocols
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;

    return false;
  } catch {
    return true; // If URL parsing fails, block it
  }
}

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
