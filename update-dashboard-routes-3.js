const fs = require('fs');
const path = require('path');

const dir = 'src/app/api/dashboard';
const routes = fs.readdirSync(dir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(dir, d.name, 'route.ts'))
  .filter(f => fs.existsSync(f));

for (const file of routes) {
  let content = fs.readFileSync(file, 'utf8');

  // If targetSiteId is declared, replace siteId with targetSiteId in function calls
  if (content.includes('const targetSiteId = ')) {
    // Replace all occurrences of `(siteId, ` with `(targetSiteId, `
    // Replace all occurrences of `siteId: siteId` with `siteId: targetSiteId` in objects where appropriate? Wait, no, targetSiteId is for queries.
    // Replace `buildFilters(siteId` with `buildFilters(targetSiteId`
    content = content.replace(/\(siteId, /g, '(targetSiteId, ');
    // But verifySiteExists needs siteId!
    content = content.replace(/verifySiteExists\(targetSiteId,/g, 'verifySiteExists(siteId,');
    
    // Also `getSeoOverview(siteId,` -> `getSeoOverview(targetSiteId,`
    content = content.replace(/getSeoOverview\(siteId,/g, 'getSeoOverview(targetSiteId,');
    
    // Also `eq(annotations.site_id, siteId)` inside overview
    content = content.replace(/eq\([a-zA-Z0-9_]+\.site_id, siteId\)/g, match => match.replace('siteId', 'targetSiteId'));
  } else {
    // If targetSiteId isn't declared, declare it!
    if (content.includes('const exists = await verifySiteExists')) {
      content = content.replace(
        /const exists = await verifySiteExists\(siteId, request\);\n\s*if \(!exists\) return siteNotFoundResponse\(\);/,
        `const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;`
      );
      content = content.replace(/\(siteId, /g, '(targetSiteId, ');
      content = content.replace(/verifySiteExists\(targetSiteId,/g, 'verifySiteExists(siteId,');
      content = content.replace(/getSeoOverview\(siteId,/g, 'getSeoOverview(targetSiteId,');
      content = content.replace(/eq\([a-zA-Z0-9_]+\.site_id, siteId\)/g, match => match.replace('siteId', 'targetSiteId'));
    }
  }

  fs.writeFileSync(file, content);
}
console.log('Fixed missed siteId replacements');
