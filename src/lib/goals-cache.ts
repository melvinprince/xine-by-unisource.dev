import { db } from "@/lib/db";
import { goals } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

interface Goal {
  id: string;
  site_id: string;
  name: string;
  type: string;
  condition: string;
  target: string;
}

interface CacheEntry {
  goals: Goal[];
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 mins
const cache = new Map<string, CacheEntry>();

export async function getCachedGoals(siteId: string): Promise<Goal[]> {
  const entry = cache.get(siteId);
  if (entry && Date.now() <= entry.expiresAt) {
    return entry.goals;
  }

  // Fetch from DB
  const siteGoals = await db.select().from(goals).where(eq(goals.site_id, siteId));
  
  cache.set(siteId, {
    goals: siteGoals,
    expiresAt: Date.now() + TTL_MS,
  });

  return siteGoals;
}

export function clearGoalsCache(siteId: string) {
  cache.delete(siteId);
}
