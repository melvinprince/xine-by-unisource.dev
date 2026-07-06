const fs = require('fs');
const path = require('path');

const dir = 'src/app/api/dashboard';
const routes = fs.readdirSync(dir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(dir, d.name, 'route.ts'))
  .filter(f => fs.existsSync(f));

for (const file of routes) {
  let content = fs.readFileSync(file, 'utf8');

  // Ensure targetSiteId is declared if it's used
  if (content.includes('targetSiteId') && !content.includes('const targetSiteId =')) {
    content = content.replace(
      /const exists = await verifySiteExists\(siteId, request\);\n\s*if \(!exists\) return siteNotFoundResponse\(\);/,
      `const exists = await verifySiteExists(siteId, request);
  if (!exists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;`
    );
    
    // Also try the other variant just in case
    content = content.replace(
      /const siteExists = await verifySiteExists\(siteId, request\);\n\s*if \(!siteExists\) return siteNotFoundResponse\(\);/,
      `const siteExists = await verifySiteExists(siteId, request);
  if (!siteExists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;`
    );
  }

  fs.writeFileSync(file, content);
}
console.log('Fixed targetSiteId definitions');
