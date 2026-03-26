import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, pageviews, events } from "@/lib/db/schema";
import { desc, sql, count } from "drizzle-orm";

/**
 * GET /api/debug — Server diagnostics endpoint
 *
 * Returns DB connection status, table counts, latest records,
 * server time info, and environment details.
 */
export async function GET() {
    const diagnostics: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        serverTimeUTC: new Date().toUTCString(),
        serverTimeLocal: new Date().toString(),
        nodeVersion: process.version,
        nodeEnv: process.env.NODE_ENV || "unknown",
        dbHost: process.env.DB_HOST
            ? `${process.env.DB_HOST.slice(0, 6)}***`
            : "not set",
        dbName: process.env.DB_NAME || "not set",
    };

    // ---- 1. Test DB Connection ----
    try {
        const result = await db.execute(sql`SELECT 1 as connected`);
        diagnostics.dbConnected = true;
        diagnostics.dbConnectionTest = "OK";
    } catch (error) {
        diagnostics.dbConnected = false;
        diagnostics.dbConnectionError = String(error);
        // Return early — no point querying tables if DB is down
        return NextResponse.json(diagnostics);
    }

    // ---- 2. Table Counts ----
    try {
        const [siteCount] = await db
            .select({ total: count() })
            .from(sites);
        const [pageviewCount] = await db
            .select({ total: count() })
            .from(pageviews);
        const [eventCount] = await db
            .select({ total: count() })
            .from(events);

        diagnostics.tableCounts = {
            sites: siteCount.total,
            pageviews: pageviewCount.total,
            events: eventCount.total,
        };
    } catch (error) {
        diagnostics.tableCountsError = String(error);
    }

    // ---- 3. Date Range of Data ----
    try {
        const [dateRange] = await db
            .select({
                earliest: sql<string>`MIN(created_at)`,
                latest: sql<string>`MAX(created_at)`,
            })
            .from(pageviews);

        diagnostics.dataDateRange = {
            earliest: dateRange.earliest
                ? new Date(dateRange.earliest).toISOString()
                : null,
            latest: dateRange.latest
                ? new Date(dateRange.latest).toISOString()
                : null,
        };
    } catch (error) {
        diagnostics.dataDateRangeError = String(error);
    }

    // ---- 4. Latest 10 Pageviews ----
    try {
        const latestPageviews = await db
            .select({
                id: pageviews.id,
                url: pageviews.url,
                visitor_id: pageviews.visitor_id,
                session_id: pageviews.session_id,
                browser: pageviews.browser,
                country: pageviews.country,
                device: pageviews.device,
                duration: pageviews.duration,
                created_at: pageviews.created_at,
            })
            .from(pageviews)
            .orderBy(desc(pageviews.created_at))
            .limit(10);

        diagnostics.latestPageviews = latestPageviews.map((row) => ({
            ...row,
            created_at: new Date(row.created_at).toISOString(),
        }));
    } catch (error) {
        diagnostics.latestPageviewsError = String(error);
    }

    // ---- 5. Latest 10 Events ----
    try {
        const latestEvents = await db
            .select({
                id: events.id,
                name: events.name,
                url: events.url,
                visitor_id: events.visitor_id,
                created_at: events.created_at,
            })
            .from(events)
            .orderBy(desc(events.created_at))
            .limit(10);

        diagnostics.latestEvents = latestEvents.map((row) => ({
            ...row,
            created_at: new Date(row.created_at).toISOString(),
        }));
    } catch (error) {
        diagnostics.latestEventsError = String(error);
    }

    // ---- 6. All Sites ----
    try {
        const allSites = await db
            .select({
                id: sites.id,
                name: sites.name,
                domain: sites.domain,
                created_at: sites.created_at,
            })
            .from(sites)
            .orderBy(desc(sites.created_at));

        diagnostics.sites = allSites.map((row) => ({
            ...row,
            created_at: new Date(row.created_at).toISOString(),
        }));
    } catch (error) {
        diagnostics.sitesError = String(error);
    }

    // ---- 7. Pageviews per day (last 7 days) ----
    try {
        const dailyCounts = await db
            .select({
                day: sql<string>`DATE(created_at)`,
                total: count(),
            })
            .from(pageviews)
            .where(
                sql`created_at >= NOW() - INTERVAL '7 days'`
            )
            .groupBy(sql`DATE(created_at)`)
            .orderBy(sql`DATE(created_at) DESC`);

        diagnostics.pageviewsLast7Days = dailyCounts.map((row) => ({
            date: row.day,
            count: row.total,
        }));
    } catch (error) {
        diagnostics.pageviewsLast7DaysError = String(error);
    }

    return NextResponse.json(diagnostics);
}
