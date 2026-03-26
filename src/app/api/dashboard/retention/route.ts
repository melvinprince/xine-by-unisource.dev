import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");

    if (!siteId) {
      return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
    }

    if (siteId !== "all") {
      const site = await db.query.sites.findFirst({
        where: eq(sites.id, siteId),
      });
      if (!site) { return NextResponse.json({ error: "Site not found" }, { status: 404 }); }
    }

    const siteFilter = siteId === "all" ? sql`` : sql`WHERE site_id = ${siteId}`;

    const result = await db.execute(sql`
      WITH Cohorts AS (
        SELECT visitor_id, DATE_TRUNC('week', MIN(started_at)) as cohort_week
        FROM sessions
        ${siteFilter}
        GROUP BY visitor_id
      ),
      Activity AS (
        SELECT visitor_id, DATE_TRUNC('week', started_at) as activity_week
        FROM sessions
        ${siteFilter}
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
