const fs = require('fs');

const file = 'src/lib/queries-advanced.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace types
content = content.replace(/siteId: string \| "all"/g, 'siteId: string | string[]');

// Replace buildSessionFilters
content = content.replace(
  /function buildSessionFilters\(siteId: string \| string\[\], dateRange: DateRange, filters\?: DimensionFilters\) {\n  const conditions = \[\n    gte\(sessions\.started_at, dateRange\.from\),\n    lte\(sessions\.started_at, dateRange\.to\),\n    eq\(sessions\.is_bot, false\),\n  \];\n  if \(siteId !== "all"\) {\n    conditions\.push\(eq\(sessions\.site_id, siteId\)\);\n  }/g,
  `function buildSessionFilters(siteId: string | string[], dateRange: DateRange, filters?: DimensionFilters) {
  const conditions = [
    gte(sessions.started_at, dateRange.from),
    lte(sessions.started_at, dateRange.to),
    eq(sessions.is_bot, false),
  ];
  if (Array.isArray(siteId)) {
    if (siteId.length > 0) conditions.push(inArray(sessions.site_id, siteId));
    else conditions.push(sql\`1 = 0\`);
  } else if (siteId !== "all") {
    conditions.push(eq(sessions.site_id, siteId));
  }`
);

// Replace buildEventFilters
content = content.replace(
  /function buildEventFilters\(siteId: string \| string\[\], dateRange: DateRange, filters\?: DimensionFilters\) {\n  const conditions = \[\n    gte\(events\.created_at, dateRange\.from\),\n    lte\(events\.created_at, dateRange\.to\),\n    eq\(events\.is_bot, false\),\n  \];\n  if \(siteId !== "all"\) {\n    conditions\.push\(eq\(events\.site_id, siteId\)\);\n  }/g,
  `function buildEventFilters(siteId: string | string[], dateRange: DateRange, filters?: DimensionFilters) {
  const conditions = [
    gte(events.created_at, dateRange.from),
    lte(events.created_at, dateRange.to),
    eq(events.is_bot, false),
  ];
  if (Array.isArray(siteId)) {
    if (siteId.length > 0) conditions.push(inArray(events.site_id, siteId));
    else conditions.push(sql\`1 = 0\`);
  } else if (siteId !== "all") {
    conditions.push(eq(events.site_id, siteId));
  }`
);

// Replace buildPageviewFilters
content = content.replace(
  /function buildPageviewFilters\(siteId: string \| string\[\], dateRange: DateRange, filters\?: DimensionFilters\) {\n  const conditions = \[\n    gte\(pageviews\.created_at, dateRange\.from\),\n    lte\(pageviews\.created_at, dateRange\.to\),\n    eq\(pageviews\.is_bot, false\),\n  \];\n  if \(siteId !== "all"\) {\n    conditions\.push\(eq\(pageviews\.site_id, siteId\)\);\n  }/g,
  `function buildPageviewFilters(siteId: string | string[], dateRange: DateRange, filters?: DimensionFilters) {
  const conditions = [
    gte(pageviews.created_at, dateRange.from),
    lte(pageviews.created_at, dateRange.to),
    eq(pageviews.is_bot, false),
  ];
  if (Array.isArray(siteId)) {
    if (siteId.length > 0) conditions.push(inArray(pageviews.site_id, siteId));
    else conditions.push(sql\`1 = 0\`);
  } else if (siteId !== "all") {
    conditions.push(eq(pageviews.site_id, siteId));
  }`
);

fs.writeFileSync(file, content);
