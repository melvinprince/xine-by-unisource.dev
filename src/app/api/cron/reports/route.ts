import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailReports, sites } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getOverviewStats } from "@/lib/queries";
import { normalizeTimeZone, zonedDateParts, zonedMidnightToUtc } from "@/lib/query-helpers";
import nodemailer from "nodemailer";

/**
 * Send a report. Returns false (without throwing) when SMTP is not
 * configured, so the caller can leave last_sent untouched and retry once it
 * is — previously the report was silently marked as sent.
 */
async function sendEmail(options: { to: string[]; subject: string; html: string }): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"Xine Analytics" <noreply@unisource.dev>`;

  if (!host || !user || !pass) {
    console.warn("[nodemailer] SMTP credentials not fully configured in environment variables.");
    return false;
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
  return true;
}

type Schedule = "daily" | "weekly" | "monthly";

/**
 * The most recent COMPLETE reporting period for a schedule, aligned to
 * calendar boundaries in the report timezone (REPORTS_TIMEZONE, default
 * UTC): yesterday, last ISO week (Mon–Sun), or last calendar month.
 *
 * Windows used to be `now − 1/7/30 days … now`, so they drifted with cron
 * timing (overlapping or leaving gaps between consecutive reports), never
 * matched a dashboard day, and "monthly" meant 30 days.
 */
function getReportPeriod(schedule: Schedule, now: Date, tz: string): { start: Date; end: Date } {
  const { year, month, day, weekday } = zonedDateParts(now, tz);
  if (schedule === "monthly") {
    return {
      start: zonedMidnightToUtc(year, month - 1, 1, tz),
      end: zonedMidnightToUtc(year, month, 1, tz),
    };
  }
  if (schedule === "weekly") {
    const sinceMonday = (weekday + 6) % 7;
    return {
      start: zonedMidnightToUtc(year, month, day - sinceMonday - 7, tz),
      end: zonedMidnightToUtc(year, month, day - sinceMonday, tz),
    };
  }
  return {
    start: zonedMidnightToUtc(year, month, day - 1, tz),
    end: zonedMidnightToUtc(year, month, day, tz),
  };
}

function formatPeriodDay(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "short", day: "numeric" }).format(instant);
}

interface ReportStats {
  visitors: number;
  pageviews: number;
  bounceRate: number;
  avgDuration: number;
}

function buildReportHtml(siteName: string, schedule: string, stats: ReportStats, periodLabel: string) {
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
            <div class="title" style="font-size: 13px;">${periodLabel}</div>
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
              <div class="card-label">Avg. Visit Duration</div>
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

    const tz = normalizeTimeZone(process.env.REPORTS_TIMEZONE);
    const now = new Date();

    for (const report of reports) {
      // 2. Due when the last send happened before the end of the most
      //    recent complete period. Late or irregular cron runs therefore
      //    still report exactly that period, once.
      const schedule: Schedule =
        report.schedule === "weekly" || report.schedule === "monthly" ? report.schedule : "daily";
      const period = getReportPeriod(schedule, now, tz);
      const shouldSend = !report.last_sent || report.last_sent.getTime() < period.end.getTime();

      if (shouldSend && Array.isArray(report.recipients) && report.recipients.length > 0) {
        // 3. Stats for exactly [period.start, period.end) — `to` is inclusive
        //    in the query layer, hence the −1 ms.
        const stats = await getOverviewStats(report.site_id, {
          from: period.start,
          to: new Date(period.end.getTime() - 1),
          tz,
        });

        // 4. Get site info
        const site = await db.query.sites.findFirst({
          where: eq(sites.id, report.site_id),
        });
        const siteName = site?.name || report.site_id;
        const lastDay = new Date(period.end.getTime() - 1);
        const periodLabel =
          schedule === "daily"
            ? formatPeriodDay(period.start, tz)
            : `${formatPeriodDay(period.start, tz)} – ${formatPeriodDay(lastDay, tz)}`;

        // 5. Send report via Nodemailer. last_sent only moves on a real send.
        try {
          const sent = await sendEmail({
            to: report.recipients as string[],
            subject: `${siteName} — ${report.schedule} analytics report (${periodLabel})`,
            html: buildReportHtml(siteName, report.schedule, stats, `${periodLabel} (${tz})`),
          });

          if (sent) {
            // 6. Update last_sent timestamp
            await db
              .update(emailReports)
              .set({ last_sent: now })
              .where(eq(emailReports.id, report.id));

            sentCount++;
          }
        } catch (mailError) {
          console.error(`[CRON] Failed to send email for site ${siteName}:`, mailError);
        }
      }
    }

    return NextResponse.json({ success: true, sent: sentCount });

  } catch (error) {
    console.error("[cron/reports] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
