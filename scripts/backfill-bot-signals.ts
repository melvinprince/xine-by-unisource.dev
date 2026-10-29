// ============================================================
// Backfill: re-flag historical traffic with the environment signals added to
// src/lib/bot-detection.ts on 2026-10-29 (screen_square, timezone_utc,
// timezone_country_mismatch alongside the existing screen_headless_default).
//
//   npx tsx scripts/backfill-bot-signals.ts            # dry run, counts only
//   npx tsx scripts/backfill-bot-signals.ts --apply    # write, in one transaction
//   npx tsx scripts/backfill-bot-signals.ts --undo     # revert every backfilled row
//
// Only the payload-derived signals can be replayed — request headers were never
// stored — so this is deliberately narrower than the live filter: a row is
// flagged only when two of these signals coincide (>= BOT_SCORE_THRESHOLD).
//
// Only rows with bot_reason NULL are candidates. That is every human row
// written before the new filter shipped; rows written after it carry
// 'human:<signals>' because they were already scored live with these
// signals, so skipping them is correct and safe to run before or after deploy.
//
// Reversible by construction: every row this touches had bot_reason NULL and
// gets 'backfill:<signals>' with bot_score left as it was, so --undo restores
// them exactly.
//
// The DB in .env is production. From the dev machine connect over Tailscale:
//   DB_HOST=100.95.24.95 npx tsx scripts/backfill-bot-signals.ts
// ============================================================

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { BOT_SCORE_THRESHOLD } from "../src/lib/bot-detection";

const mode = process.argv.includes("--undo") ? "undo" : process.argv.includes("--apply") ? "apply" : "dry-run";

// Mirrors the weights in detectBot(). Keep the two in sync.
const scored = sql`
  SELECT id, site_id, session_id,
    (CASE WHEN screen = '800x600' THEN 35 ELSE 0 END)
    + (CASE WHEN device = 'desktop' AND screen ~ '^[0-9]+x[0-9]+$'
            AND split_part(screen, 'x', 1)::int >= 600
            AND split_part(screen, 'x', 1) = split_part(screen, 'x', 2) THEN 35 ELSE 0 END)
    + (CASE WHEN lower(timezone) IN ('utc','etc/utc','etc/gmt','gmt','etc/unknown','etc/universal','universal','zulu')
            AND coalesce(os, '') <> 'Linux' AND coalesce(browser, '') <> 'Firefox' THEN 25 ELSE 0 END)
    + (CASE WHEN lower(timezone) IN ('asia/shanghai','asia/chongqing','asia/chungking','asia/harbin','asia/urumqi','prc')
            AND coalesce(country, '') <> '' AND upper(country) NOT IN ('CN','HK','MO','TW') THEN 25 ELSE 0 END) AS score,
    concat_ws(',',
      CASE WHEN screen = '800x600' THEN 'screen_headless_default' END,
      CASE WHEN device = 'desktop' AND screen ~ '^[0-9]+x[0-9]+$'
            AND split_part(screen, 'x', 1)::int >= 600
            AND split_part(screen, 'x', 1) = split_part(screen, 'x', 2) THEN 'screen_square' END,
      CASE WHEN lower(timezone) IN ('utc','etc/utc','etc/gmt','gmt','etc/unknown','etc/universal','universal','zulu')
            AND coalesce(os, '') <> 'Linux' AND coalesce(browser, '') <> 'Firefox' THEN 'timezone_utc' END,
      CASE WHEN lower(timezone) IN ('asia/shanghai','asia/chongqing','asia/chungking','asia/harbin','asia/urumqi','prc')
            AND coalesce(country, '') <> '' AND upper(country) NOT IN ('CN','HK','MO','TW') THEN 'timezone_country_mismatch' END
    ) AS signals
  FROM pageviews
  WHERE is_bot IS NOT TRUE AND bot_reason IS NULL`;

async function run() {
  console.log(`mode: ${mode}`);

  if (mode === "undo") {
    await db.transaction(async (tx) => {
      for (const table of ["pageviews", "sessions", "events"]) {
        const r = await tx.execute(
          sql`UPDATE ${sql.identifier(table)} SET is_bot = false, bot_reason = NULL WHERE bot_reason LIKE 'backfill:%'`
        );
        console.log(`${table}: restored ${r.rowCount}`);
      }
    });
    process.exit(0);
  }

  const preview = await db.execute(sql`
    WITH s AS (${scored})
    SELECT st.name, count(*) AS pageviews, count(DISTINCT s.session_id) AS sessions
    FROM s JOIN sites st ON st.id = s.site_id
    WHERE s.score >= ${BOT_SCORE_THRESHOLD}
    GROUP BY st.name ORDER BY 2 DESC`);
  console.table(preview.rows);

  if (mode !== "apply") {
    console.log("dry run — nothing written. Re-run with --apply.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    const pv = await tx.execute(sql`
      WITH s AS (${scored})
      UPDATE pageviews p
      SET is_bot = true, bot_reason = left('backfill:' || s.signals, 64)
      FROM s
      WHERE p.id = s.id AND s.score >= ${BOT_SCORE_THRESHOLD}`);
    console.log(`pageviews flagged: ${pv.rowCount}`);

    // A session is flagged only once none of its pageviews are human any
    // more, so a person stitched into the same session is never hidden.
    const se = await tx.execute(sql`
      UPDATE sessions s
      SET is_bot = true, bot_reason = 'backfill:session'
      WHERE s.is_bot = false AND s.bot_reason IS NULL
        AND EXISTS (SELECT 1 FROM pageviews p WHERE p.session_id = s.id AND p.site_id = s.site_id AND p.bot_reason LIKE 'backfill:%')
        AND NOT EXISTS (SELECT 1 FROM pageviews p WHERE p.session_id = s.id AND p.site_id = s.site_id AND p.is_bot IS NOT TRUE)`);
    console.log(`sessions flagged: ${se.rowCount}`);

    const ev = await tx.execute(sql`
      UPDATE events e
      SET is_bot = true, bot_reason = 'backfill:session'
      FROM sessions s
      WHERE e.session_id = s.id AND e.site_id = s.site_id
        AND s.bot_reason = 'backfill:session'
        AND e.is_bot IS NOT TRUE AND e.bot_reason IS NULL`);
    console.log(`events flagged: ${ev.rowCount}`);
  });

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
