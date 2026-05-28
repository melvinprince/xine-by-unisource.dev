import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailReports, sites } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { getOverviewStats } from "@/lib/queries";
import nodemailer from "nodemailer";

async function sendEmail(options: { to: string[]; subject: string; html: string }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"Xine Analytics" <noreply@unisource.dev>`;

  if (!host || !user || !pass) {
    console.warn("[nodemailer] SMTP credentials not fully configured in environment variables.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  await transporter.sendMail({
    from,
    to: options.to.join(", "),
    subject: options.subject,
    html: options.html,
  });
}

interface ReportStats {
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
}

function buildReportHtml(siteName: string, schedule: string, stats: ReportStats) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${siteName} Analytics Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #030712;
            color: #f3f4f6;
            margin: 0;
            padding: 20px;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #0b0f19;
            border: 1px solid #1f2937;
            border-radius: 12px;
            padding: 30px;
          }
          .header {
            border-bottom: 1px solid #1f2937;
            padding-bottom: 20px;
            margin-bottom: 25px;
            text-align: center;
          }
          .logo {
            font-size: 24px;
            font-weight: 700;
            color: #3b82f6;
            letter-spacing: -0.05em;
          }
          .title {
            font-size: 18px;
            color: #9ca3af;
            margin-top: 5px;
            text-transform: capitalize;
          }
          .grid {
            margin-bottom: 25px;
          }
          .card {
            background-color: #111827;
            border: 1px solid #1f2937;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
            text-align: left;
          }
          .card-label {
            font-size: 12px;
            color: #9ca3af;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 5px;
          }
          .card-value {
            font-size: 20px;
            font-weight: 700;
            color: #ffffff;
          }
          .footer {
            border-top: 1px solid #1f2937;
            padding-top: 20px;
            margin-top: 25px;
            text-align: center;
            font-size: 12px;
            color: #6b7280;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">XINE</div>
            <div class="title">${siteName} — ${schedule} Report</div>
          </div>
          <div class="grid">
            <div class="card">
              <div class="card-label">Unique Visitors</div>
              <div class="card-value">${stats.visitors.toLocaleString()}</div>
            </div>
            <div class="card">
              <div class="card-label">Total Pageviews</div>
              <div class="card-value">${stats.pageviews.toLocaleString()}</div>
            </div>
            <div class="card">
              <div class="card-label">Bounce Rate</div>
              <div class="card-value">${stats.bounceRate}%</div>
            </div>
            <div class="card">
              <div class="card-label">Avg. Duration</div>
              <div class="card-value">${Math.round(stats.avgDuration)}s</div>
            </div>
          </div>
          <div class="footer">
            <p>You are receiving this automated email report configured in your Xine dashboard settings.</p>
            <p>&copy; ${new Date().getFullYear()} Xine by Unisource. Privacy-first, self-hosted web analytics.</p>
          </div>
        </div>
      </body>
    </html>
  `;
}

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
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

        // 5. Send report via Nodemailer
        try {
          await sendEmail({
            to: report.recipients as string[],
            subject: `${siteName} — ${report.schedule} analytics report`,
            html: buildReportHtml(siteName, report.schedule, stats),
          });
        } catch (mailError) {
          console.error(`[CRON] Failed to send email for site ${siteName}:`, mailError);
        }

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
