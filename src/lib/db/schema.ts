import { pgTable, uuid, text, bigserial, integer, jsonb, timestamp, index, boolean, varchar, unique } from "drizzle-orm/pg-core";

// ============================================================
// 1. SITES TABLE
// ============================================================
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  domain: text("domain").notNull().unique(),
  api_key: text("api_key").notNull().unique(),
  user_id: text("user_id").notNull(),
  is_public: boolean("is_public").default(false),
  api_access_enabled: boolean("api_access_enabled").default(false),
  server_api_key: text("server_api_key").notNull().unique(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 2. PAGEVIEWS TABLE
// ============================================================
export const pageviews = pgTable(
  "pageviews",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    site_id: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    referrer: text("referrer"),
    title: text("title"),
    utm_source: text("utm_source"),
    utm_medium: text("utm_medium"),
    utm_campaign: text("utm_campaign"),
    visitor_id: text("visitor_id").notNull(),
    session_id: text("session_id").notNull(),
    country: text("country"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: varchar("device", { length: 50 }),
    ip_hash: text("ip_hash"),
    screen: text("screen"),
    language: text("language"),
    timezone: text("timezone"),
    continent: varchar("continent", { length: 50 }),
    duration: integer("duration").default(0),
    connection_type: varchar("connection_type", { length: 50 }),
    ttfb: integer("ttfb"), // Time to first byte
    is_bot: boolean("is_bot").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pageviews_site_id").on(table.site_id),
    index("idx_pageviews_created_at").on(table.created_at),
    index("idx_pageviews_visitor_id").on(table.visitor_id),
    index("idx_pageviews_session_url").on(table.session_id, table.url),
  ]
);

// ============================================================
// 3. EVENTS TABLE
// ============================================================
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    site_id: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    properties: jsonb("properties").default({}),
    visitor_id: text("visitor_id").notNull(),
    session_id: text("session_id").notNull(),
    url: text("url"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_events_site_id").on(table.site_id),
    index("idx_events_created_at").on(table.created_at),
    index("idx_events_name").on(table.name),
  ]
);

// ============================================================
// 4. SESSIONS TABLE (pre-computed at ingestion time)
// ============================================================
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // session_id from t.js
    site_id: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    visitor_id: text("visitor_id").notNull(),
    entry_page: text("entry_page").notNull(),
    exit_page: text("exit_page").notNull(),
    page_count: integer("page_count").notNull().default(1),
    total_duration: integer("total_duration").notNull().default(0),
    referrer: text("referrer"),
    utm_source: text("utm_source"),
    utm_medium: text("utm_medium"),
    utm_campaign: text("utm_campaign"),
    country: text("country"),
    city: text("city"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
    screen: text("screen"),
    language: text("language"),
    timezone: text("timezone"),
    connection_type: text("connection_type"),
    is_bot: boolean("is_bot").notNull().default(false),
    is_bounce: boolean("is_bounce").notNull().default(true),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    ended_at: timestamp("ended_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_sessions_site_id").on(table.site_id),
    index("idx_sessions_started_at").on(table.started_at),
    index("idx_sessions_visitor_id").on(table.visitor_id),
    index("idx_sessions_is_bounce").on(table.is_bounce),
    index("idx_sessions_entry_page").on(table.entry_page),
  ]
);

// ============================================================
// 5. SITE SETTINGS TABLE (Feature Flags)
// ============================================================
export const siteSettings = pgTable("site_settings", {
  site_id: uuid("site_id")
    .primaryKey()
    .references(() => sites.id, { onDelete: "cascade" }),
  features: jsonb("features").default({
    web_vitals: true,
    scroll_depth: true,
    outbound_clicks: true,
    js_errors: true,
    custom_events: true,
    click_tracking: false,
    rage_clicks: false,
    file_downloads: false,
    form_abandonment: false,
    session_replay: false,
  }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 6. GOALS TABLE
// ============================================================
export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull(), // 'pageview', 'event', 'duration'
  condition: varchar("condition", { length: 50 }).notNull(), // 'equals', 'contains', 'starts_with', 'greater_than'
  target: varchar("target", { length: 255 }).notNull(), // e.g., '/checkout/success' or '120'
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 7. GOAL CONVERSIONS TABLE
// ============================================================
export const goalConversions = pgTable("goal_conversions", {
  id: uuid("id").primaryKey().defaultRandom(),
  goal_id: uuid("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  session_id: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  visitor_id: uuid("visitor_id").notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_conversions_site_id").on(table.site_id),
  index("idx_conversions_goal_id").on(table.goal_id),
  index("idx_conversions_created_at").on(table.created_at),
  unique("uniq_goal_session").on(table.goal_id, table.session_id),
]);

// ============================================================
// 8. FUNNELS TABLE
// ============================================================
export const funnels = pgTable("funnels", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  steps: jsonb("steps").notNull(), // Array of { id, name, type, condition, target }
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 9. ANNOTATIONS TABLE
// ============================================================
export const annotations = pgTable("annotations", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  date: timestamp("date", { withTimezone: true }).notNull(),
  category: varchar("category", { length: 50 }).default("note"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 10. REPLAY EVENTS
// ============================================================
export const replayEvents = pgTable("replay_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  session_id: text("session_id").notNull(),
  url: text("url").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  events: jsonb("events").notNull(),
});

// ============================================================
// 11. EMAIL REPORTS
// ============================================================
export const emailReports = pgTable("email_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  schedule: varchar("schedule", { length: 50 }).notNull().default("weekly"), // daily, weekly, monthly
  recipients: jsonb("recipients").notNull(), // Array of email strings
  last_sent: timestamp("last_sent", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 12. UPTIME CHECKS
// ============================================================
export const uptimeChecks = pgTable("uptime_checks", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  status: varchar("status", { length: 20 }).notNull(), // up, down, degraded
  response_time: integer("response_time"),
  checked_at: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 13. ALERTS & NOTIFICATIONS
// ============================================================
export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  site_id: uuid("site_id")
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(), // traffic_spike, traffic_drop, error_increase
  threshold: jsonb("threshold").notNull(), // { value: 1000, timeframe: '1h' }
  channel: varchar("channel", { length: 50 }).notNull().default("email"), // email, webhook
  channel_target: text("channel_target").notNull(), // email address or webhook url
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ============================================================
// 14. LOGIN ATTEMPTS (failed password tracking)
// ============================================================
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    user_agent: text("user_agent").notNull(),
    attempts: integer("attempts").notNull().default(1),
    last_attempt_at: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("uniq_ip_ua").on(table.ip, table.user_agent),
    index("idx_login_attempts_ip").on(table.ip),
  ]
);

// ============================================================
// 15. BANNED LOGINS (permanent IP/device bans)
// ============================================================
export const bannedLogins = pgTable(
  "banned_logins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ip: text("ip").notNull(),
    user_agent: text("user_agent").notNull(),
    reason: text("reason").notNull().default("Too many failed login attempts"),
    banned_at: timestamp("banned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_banned_logins_ip").on(table.ip),
    index("idx_banned_logins_ua").on(table.user_agent),
  ]
);

