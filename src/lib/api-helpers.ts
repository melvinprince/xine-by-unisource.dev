import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sites, userSites } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export interface ParsedParams {
  siteId: string;
  dateRange: { from: Date; to: Date };
}

export function parseDateRange(from: string | null, to: string | null, rangePreset?: string | null): { from: Date; to: Date } | null {
  const toDate = to ? new Date(Number(to) || to) : new Date();
  let fromDate: Date;

  if (from) {
    fromDate = new Date(Number(from) || from);
  } else {
    fromDate = new Date();
    const preset = rangePreset || "30d";
    switch (preset) {
      case "1h": fromDate.setHours(fromDate.getHours() - 1); break;
      case "3h": fromDate.setHours(fromDate.getHours() - 3); break;
      case "12h": fromDate.setHours(fromDate.getHours() - 12); break;
      case "24h": fromDate.setHours(fromDate.getHours() - 24); break;
      case "7d": fromDate.setDate(fromDate.getDate() - 7); break;
      case "90d": fromDate.setDate(fromDate.getDate() - 90); break;
      case "30d":
      default:
        fromDate.setDate(fromDate.getDate() - 30);
        break;
    }
  }

  if (isNaN(toDate.getTime()) || isNaN(fromDate.getTime())) return null;
  if (fromDate > toDate) return null;

  // Extend date-only strings to end of day if it does not contain time
  if (to && typeof to === "string" && !to.includes("T") && !to.includes(":") && isNaN(Number(to))) {
    toDate.setHours(23, 59, 59, 999);
  }

  return { from: fromDate, to: toDate };
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

