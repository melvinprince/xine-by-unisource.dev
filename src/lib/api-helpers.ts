import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, userSites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { normalizeTimeZone, zonedMidnightToUtc } from "@/lib/query-helpers";
import type { DateRange } from "@/lib/types";

export interface ParsedParams {
  siteId: string;
  dateRange: { from: Date; to: Date };
}

/**
 * Parse a from/to pair (or a relative preset) into a DateRange.
 *
 * - Full timestamps (ISO with a time part, or epoch ms) are used as-is.
 *   The dashboard sends these for every preset.
 * - Date-only strings ("2026-10-01", from the MCP tools, the v1 API and
 *   chart day-clicks) are calendar days in `tz`: `from` is local midnight
 *   and `to` is the end of that day (next local midnight − 1 ms). Both are
 *   read in the same zone — previously `from` was UTC midnight while `to`
 *   was extended with server-local setHours.
 * - Presets ("7d", "24h", …) are rolling windows ending now, so "7d" is
 *   exactly 7 × 24 h, not 8 calendar days.
 *
 * `tz` is validated (unknown zones fall back to UTC) and carried on the
 * result so day buckets downstream use the same zone.
 */
export function parseDateRange(
  from: string | null,
  to: string | null,
  rangePreset?: string | null,
  tz?: string | null
): DateRange | null {
  const zone = normalizeTimeZone(tz);
  const now = new Date();

  const parseBound = (value: string, edge: "start" | "end"): Date => {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) {
      const [, y, m, d] = dateOnly.map(Number);
      if (edge === "start") return zonedMidnightToUtc(y, m, d, zone);
      return new Date(zonedMidnightToUtc(y, m, d + 1, zone).getTime() - 1);
    }
    return new Date(Number(value) || value);
  };

  const toDate = to ? parseBound(to, "end") : now;
  let fromDate: Date;

  if (from) {
    fromDate = parseBound(from, "start");
  } else {
    const preset = rangePreset || "30d";
    const HOUR = 60 * 60 * 1000;
    const DAY = 24 * HOUR;
    const spans: Record<string, number> = {
      "1h": HOUR,
      "3h": 3 * HOUR,
      "12h": 12 * HOUR,
      "24h": DAY,
      "7d": 7 * DAY,
      "30d": 30 * DAY,
      "90d": 90 * DAY,
    };
    fromDate = new Date(toDate.getTime() - (spans[preset] ?? spans["30d"]));
  }

  if (isNaN(toDate.getTime()) || isNaN(fromDate.getTime())) return null;
  if (fromDate > toDate) return null;

  return { from: fromDate, to: toDate, tz: zone };
}

/** Read the viewer's timezone (`tz` query param) from a request's search params. */
export function parseTimeZoneParam(searchParams: URLSearchParams): string {
  return normalizeTimeZone(searchParams.get("tz"));
}

export function getUserFromRequest(request: NextRequest): string | null {
  return request.headers.get("x-user-id");
}

export async function getUserAccessibleSiteIds(userId: string): Promise<string[]> {
  const accessibleSites = await db
    .select({ site_id: userSites.site_id })
    .from(userSites)
    .where(eq(userSites.user_id, userId));
  return accessibleSites.map(s => s.site_id);
}

export async function verifyUserSiteAccess(userId: string, siteId: string): Promise<boolean> {
  const access = await db
    .select({ id: userSites.id })
    .from(userSites)
    .where(and(eq(userSites.user_id, userId), eq(userSites.site_id, siteId)))
    .limit(1);
  return access.length > 0;
}

export async function verifySiteExists(siteId: string, request?: NextRequest): Promise<boolean> {
  if (siteId === "all") return true;
  // UUID format check
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)) return false;
  
  try {
    const site = await db.query.sites.findFirst({ where: eq(sites.id, siteId) });
    if (!site) return false;

    if (request) {
      const userId = getUserFromRequest(request);
      if (userId) {
        return verifyUserSiteAccess(userId, siteId);
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

export function invalidDateResponse() {
  return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
}

export function siteNotFoundResponse() {
  return NextResponse.json({ error: "Site not found" }, { status: 404 });
}

export interface DimensionFilters {
  countries?: string[];
  browsers?: string[];
  devices?: string[];
  sources?: string[];
  pages?: string[];
}

export function parseFilters(searchParams: URLSearchParams): DimensionFilters {
  const getParamArray = (key: string) => {
    const val = searchParams.get(key);
    if (!val) return undefined;
    const arr = val.split(",").map(v => decodeURIComponent(v).trim()).filter(Boolean);
    return arr.length > 0 ? arr : undefined;
  };

  return {
    countries: getParamArray("countries"),
    browsers: getParamArray("browsers"),
    devices: getParamArray("devices"),
    sources: getParamArray("sources"),
    pages: getParamArray("pages"),
  };
}

