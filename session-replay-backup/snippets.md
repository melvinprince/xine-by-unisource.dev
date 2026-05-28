# Removed Session Replay Code Snippets

This document contains snippets of code that were stripped out from settings, database schemas, relations, zod validations, UI sidebars, and the client tracking script. Use these snippets to restore this feature in the future.

---

## 1. Drizzle Schema (`src/lib/db/schema.ts`)

### Site Settings Default Features:
```typescript
// Add back to features jsonb default object in siteSettings table definition:
session_replay: false,
```

### Table Definition:
```typescript
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
```

---

## 2. Drizzle Relations (`src/lib/db/relations.ts`)

### Import:
```typescript
import {
  // ...
  replayEvents,
} from "./schema";
```

### Site Relations Hook:
```typescript
export const sitesRelations = relations(sites, ({ many, one }) => ({
  // ...
  replayEvents: many(replayEvents),
}));
```

### Table Relations:
```typescript
// ---- Replay Events Relations ----
export const replayEventsRelations = relations(replayEvents, ({ one }) => ({
  site: one(sites, {
    fields: [replayEvents.site_id],
    references: [sites.id],
  }),
}));
```

---

## 3. Zod Validation Schema (`src/lib/validation.ts`)

### Site Features Zod Definition:
```typescript
export const siteFeaturesSchema = z.object({
  // ...
  session_replay: z.boolean().optional(),
}).strict();
```

---

## 4. Settings Defaults API (`src/app/api/sites/[siteId]/settings/route.ts`)

### Default Features returned by GET:
```typescript
      return NextResponse.json({
        // ...
        session_replay: false,
      });
```

---

## 5. Settings Page UI (`src/app/dashboard/settings/page.tsx`)

### Feature Toggles:
```typescript
// Add back to featureGroups inside Premium Features:
{ key: "session_replay", label: "Session Replay", description: "Record and playback user interactions.", size: "~2.0KB" },
```

### Feature Size Estimation:
```typescript
// Add back to featureSizes record:
session_replay: 2.0,
```

---

## 6. Dashboard Sidebar (`src/components/Sidebar.tsx`)

### Navigation Links:
```typescript
// Add back to navItems array (before Monitors):
{ href: "/dashboard/replay", label: "Session Replay", icon: PlaySquare },
```

---

## 7. Client-Side Tracking Script (`src/tracking.js`)

### Feature Module block (within opt-in features fetch block):
```javascript
        // 9. Session Replay (Lite)
        if (f.session_replay) {
          var replayEvents = [];
          
          try {
            var html = document.documentElement.outerHTML;
            var sanitized = html.replace(
              /(<input[^>]*type=["'](password|email|tel|number|credit)[^>]*value=["'])[^"']*(["'])/gi,
              '$1[REDACTED]$3'
            );
            sanitized = sanitized.replace(/<[^>]*data-xine-redact[^>]*>[\s\S]*?<\/[^>]*>/gi, '[REDACTED]');
            replayEvents.push({ type: 'snapshot', html: sanitized, width: window.innerWidth, height: window.innerHeight, time: Date.now() });
          } catch(e) {}

          var recordReplayEvent = function(eType, data) {
            data.type = eType;
            data.time = Date.now();
            replayEvents.push(data);
          };

          var lastMove = 0;
          document.addEventListener('mousemove', function(e) {
            var now = Date.now();
            if (now - lastMove > 250) { 
              recordReplayEvent('mouse', { x: e.clientX, y: e.clientY });
              lastMove = now;
            }
          }, { passive: true });

          document.addEventListener('click', function(e) {
            recordReplayEvent('click', { x: e.clientX, y: e.clientY });
          }, { passive: true, capture: true });

          var lastScroll = 0;
          window.addEventListener('scroll', function() {
            var now = Date.now();
            if (now - lastScroll > 500) {
              recordReplayEvent('scroll', { x: window.scrollX, y: window.scrollY });
              lastScroll = now;
            }
          }, { passive: true });

          setInterval(function() {
            if (replayEvents.length > 0 && !isBlocked) {
              var payload = { api_key: apiKey, session_id: sid, url: currentUrl, events: replayEvents };
              fetch(endpoint.replace('/collect', '/collect/replay'), {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true
              }).catch(function(){ isBlocked = true; });
              replayEvents = [];
            }
          }, 10000); 
        }
```
