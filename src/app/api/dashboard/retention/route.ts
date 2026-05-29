import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { verifySiteExists, parseDateRange, siteNotFoundResponse, invalidDateResponse, parseFilters } from "@/lib/api-helpers";
import { filterStore } from "@/lib/filter-store";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId") || "all";
    const fromStr = searchParams.get("from");
    const toStr = searchParams.get("to");

    // 1. Verify Site UUID exists in database (or is "all")
    const exists = await verifySiteExists(siteId);
    if (!exists) return siteNotFoundResponse();

    // 2. Safely parse and validate date range
    const dateRange = parseDateRange(fromStr, toStr);
    if (!dateRange) return invalidDateResponse();

    const { from, to } = dateRange;
    const filters = parseFilters(searchParams);

    const siteFilter = siteId === "all" ? sql`` : sql`AND site_id = ${siteId}`;
    const dateFilter = sql`started_at >= ${from} AND started_at <= ${to}`;

    const extraConditions: string[] = [];
    if (filters) {
      if (filters.countries && filters.countries.length > 0) {
        const list = filters.countries.map(c => `'${c.replace(/'/g, "''")}'`).join(",");
        extraConditions.push(`AND country IN (${list})`);
      }
      if (filters.browsers && filters.browsers.length > 0) {
        const list = filters.browsers.map(b => `'${b.replace(/'/g, "''")}'`).join(",");
        extraConditions.push(`AND browser IN (${list})`);
      }
      if (filters.devices && filters.devices.length > 0) {
        const deviceList = filters.devices;
        const hasDesktop = deviceList.includes("desktop");
        const list = deviceList.map(d => `'${d.replace(/'/g, "''")}'`).join(",");
        if (hasDesktop) {
          extraConditions.push(`AND (LOWER(device) IN (${list}) OR device IS NULL)`);
        } else {
          extraConditions.push(`AND LOWER(device) IN (${list})`);
        }
      }
      if (filters.sources && filters.sources.length > 0) {
        const matchers = filters.sources.map(s => {
          const cleanSource = s.replace(/'/g, "''");
          return `(
            CASE 
              WHEN referrer ~ '^https?://' 
              THEN regexp_replace(referrer, '^https?://([^/]+).*$', '\\1')
              ELSE referrer
            END
          ) = '${cleanSource}'`;
        }).join(" OR ");
        extraConditions.push(`AND (${matchers})`);
      }
      if (filters.pages && filters.pages.length > 0) {
        const list = filters.pages.map(p => `'${p.replace(/'/g, "''")}'`).join(",");
        extraConditions.push(`AND entry_page IN (${list})`);
      }
    }
    const extraFilterSql = sql.raw(extraConditions.join(" "));

    const result = await db.execute(sql`
      WITH Cohorts AS (
        SELECT visitor_id, DATE_TRUNC('week', MIN(started_at)) as cohort_week
        FROM sessions
        WHERE ${dateFilter} ${siteFilter} ${extraFilterSql}
        GROUP BY visitor_id
      ),
      Activity AS (
        SELECT visitor_id, DATE_TRUNC('week', started_at) as activity_week
        FROM sessions
        WHERE ${dateFilter} ${siteFilter} ${extraFilterSql}
      ),
      CohortSize AS (
        SELECT cohort_week, COUNT(DISTINCT visitor_id) as total_users
        FROM Cohorts
        GROUP BY cohort_week
      ),
      Retention AS (
        SELECT 
          c.cohort_week,
          EXTRACT(DAY FROM (MAX(a.activity_week) - MAX(c.cohort_week))) / 7 as week_number,
          COUNT(DISTINCT a.visitor_id) as returned_users
        FROM Cohorts c
        JOIN Activity a ON c.visitor_id = a.visitor_id
        GROUP BY c.cohort_week, a.activity_week
      )
      SELECT 
        r.cohort_week as "cohortWeek", 
        s.total_users as "totalUsers", 
        r.week_number as "weekNumber", 
        r.returned_users as "returnedUsers"
      FROM Retention r
      JOIN CohortSize s ON r.cohort_week = s.cohort_week
      ORDER BY r.cohort_week DESC, r.week_number ASC
    `);

    return NextResponse.json({ cohorts: result.rows });
  } catch (error) {
    console.error("[dashboard/retention] GET Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
