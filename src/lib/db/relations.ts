import { relations } from "drizzle-orm";
import {
  sites,
  pageviews,
  events,
  sessions,
  siteSettings,
  goals,
  goalConversions,
  funnels,
  annotations,
  replayEvents,
  emailReports,
  uptimeChecks,
  alerts,
} from "./schema";

// ---- Site Relations ----
export const sitesRelations = relations(sites, ({ many, one }) => ({
  pageviews: many(pageviews),
  events: many(events),
  sessions: many(sessions),
  settings: one(siteSettings),
  goals: many(goals),
  funnels: many(funnels),
  annotations: many(annotations),
  replayEvents: many(replayEvents),
  emailReports: many(emailReports),
  uptimeChecks: many(uptimeChecks),
  alerts: many(alerts),
}));

// ---- Pageview Relations ----
export const pageviewsRelations = relations(pageviews, ({ one }) => ({
  site: one(sites, {
    fields: [pageviews.site_id],
    references: [sites.id],
  }),
}));

// ---- Event Relations ----
export const eventsRelations = relations(events, ({ one }) => ({
  site: one(sites, {
    fields: [events.site_id],
    references: [sites.id],
  }),
}));

// ---- Session Relations ----
export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  site: one(sites, {
    fields: [sessions.site_id],
    references: [sites.id],
  }),
  goalConversions: many(goalConversions),
}));

// ---- Site Settings Relations ----
export const siteSettingsRelations = relations(siteSettings, ({ one }) => ({
  site: one(sites, {
    fields: [siteSettings.site_id],
    references: [sites.id],
  }),
}));

// ---- Goal Relations ----
export const goalsRelations = relations(goals, ({ one, many }) => ({
  site: one(sites, {
    fields: [goals.site_id],
    references: [sites.id],
  }),
  conversions: many(goalConversions),
}));

// ---- Goal Conversion Relations ----
export const goalConversionsRelations = relations(goalConversions, ({ one }) => ({
  goal: one(goals, {
    fields: [goalConversions.goal_id],
    references: [goals.id],
  }),
  site: one(sites, {
    fields: [goalConversions.site_id],
    references: [sites.id],
  }),
  session: one(sessions, {
    fields: [goalConversions.session_id],
    references: [sessions.id],
  }),
}));

// ---- Funnel Relations ----
export const funnelsRelations = relations(funnels, ({ one }) => ({
  site: one(sites, {
    fields: [funnels.site_id],
    references: [sites.id],
  }),
}));

// ---- Annotation Relations ----
export const annotationsRelations = relations(annotations, ({ one }) => ({
  site: one(sites, {
    fields: [annotations.site_id],
    references: [sites.id],
  }),
}));

// ---- Replay Events Relations ----
export const replayEventsRelations = relations(replayEvents, ({ one }) => ({
  site: one(sites, {
    fields: [replayEvents.site_id],
    references: [sites.id],
  }),
}));

// ---- Email Reports Relations ----
export const emailReportsRelations = relations(emailReports, ({ one }) => ({
  site: one(sites, {
    fields: [emailReports.site_id],
    references: [sites.id],
  }),
}));

// ---- Uptime Checks Relations ----
export const uptimeChecksRelations = relations(uptimeChecks, ({ one }) => ({
  site: one(sites, {
    fields: [uptimeChecks.site_id],
    references: [sites.id],
  }),
}));

// ---- Alerts Relations ----
export const alertsRelations = relations(alerts, ({ one }) => ({
  site: one(sites, {
    fields: [alerts.site_id],
    references: [sites.id],
  }),
}));
