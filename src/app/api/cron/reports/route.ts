import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailReports, sites } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getOverviewStats } from "@/lib/queries";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Fetch all email reports
    const reports = await db.select().from(emailReports);
    let sentCount = 0;

    for (const report of reports) {
      // 2. Determine if it's time to send based on schedule and last_sent
      let shouldSend = false;
      const now = new Date();
      if (!report.last_sent) {
        shouldSend = true;
      } else {
        const diffHours = (now.getTime() - report.last_sent.getTime()) / (1000 * 60 * 60);
        if (report.schedule === 'daily' && diffHours >= 24) shouldSend = true;
        if (report.schedule === 'weekly' && diffHours >= (24 * 7)) shouldSend = true;
        if (report.schedule === 'monthly' && diffHours >= (24 * 30)) shouldSend = true;
      }

      if (shouldSend && Array.isArray(report.recipients) && report.recipients.length > 0) {
        // 3. Fetch stats for the report period
        const from = new Date();
        if (report.schedule === 'daily') from.setDate(from.getDate() - 1);
        else if (report.schedule === 'weekly') from.setDate(from.getDate() - 7);
        else from.setDate(from.getDate() - 30);

        const stats = await getOverviewStats(report.site_id, { from, to: now });

        // 4. Get site info
        const site = await db.query.sites.findFirst({
          where: eq(sites.id, report.site_id),
        });
        const siteName = site?.name || report.site_id;

        // 5. Send report (log for now — wire nodemailer/Resend here)
        const recipientList = (report.recipients as string[]).join(', ');
        console.log(
          `[CRON] Sending ${report.schedule} report for "${siteName}" to ${recipientList}`,
          `| Visitors: ${stats.visitors} | Pageviews: ${stats.pageviews} | Bounce: ${stats.bounceRate}%`
        );

        // TODO: Replace console.log with actual email sending:
        // await sendEmail({
        //   to: report.recipients as string[],
        //   subject: `${siteName} — ${report.schedule} analytics report`,
        //   html: buildReportHtml(siteName, stats),
        // });

        // 6. Update last_sent timestamp
        await db
          .update(emailReports)
          .set({ last_sent: now })
          .where(eq(emailReports.id, report.id));
        
        sentCount++;
      }
    }

    return NextResponse.json({ success: true, sent: sentCount });

  } catch (error) {
    console.error("[cron/reports] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
