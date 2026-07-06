const fs = require('fs');
const path = require('path');

const dir = 'src/app/api/dashboard';
const routes = fs.readdirSync(dir, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => path.join(dir, d.name, 'route.ts'))
  .filter(f => fs.existsSync(f));

for (const file of routes) {
  let content = fs.readFileSync(file, 'utf8');

  // Add imports if not present
  if (!content.includes('getUserFromRequest')) {
    content = content.replace(
      /import \{([^}]+)\} from "@\/lib\/api-helpers";/,
      (match, p1) => {
        const parts = p1.split(',').map(s => s.trim()).filter(Boolean);
        const newImports = ['getUserFromRequest', 'getUserAccessibleSiteIds'];
        for (const ni of newImports) {
          if (!parts.includes(ni)) parts.push(ni);
        }
        return `import { ${parts.join(", ")} } from "@/lib/api-helpers";`;
      }
    );
  }

  // Inject userId extraction
  if (!content.includes('const userId = getUserFromRequest')) {
    content = content.replace(
      /export async function GET\(request: NextRequest\) {/,
      `export async function GET(request: NextRequest) {
  const userId = getUserFromRequest(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });`
    );
  }

  // Update verifySiteExists
  content = content.replace(/verifySiteExists\(siteId\)/g, 'verifySiteExists(siteId, request)');

  // Update siteId passed to queries
  if (!content.includes('targetSiteId')) {
    content = content.replace(
      /const siteExists = await verifySiteExists\(siteId, request\);\n\s*if \(!siteExists\) return siteNotFoundResponse\(\);/,
      `const siteExists = await verifySiteExists(siteId, request);
  if (!siteExists) return siteNotFoundResponse();

  const targetSiteId = siteId === "all" ? await getUserAccessibleSiteIds(userId) : siteId;`
    );

    const queryFunctions = [
      'getOverviewStats', 'getVisitorTimeseries', 'getTopPages', 'getTopSources',
      'getDeviceBreakdown', 'getBrowserBreakdown', 'getCountryBreakdown',
      'getSessionAnalytics', 'getNewVsReturning', 'getEngagementMetrics',
      'getScrollDepth', 'getHeatmapData', 'getPeakHours', 'getEntryExitPages',
      'getPageExitRates', 'getWebVitalTrends', 'getPageWebVitals',
      'getJsErrors', 'getErrorTrends', 'getCampaignPerformance', 'getSourceQuality',
      'getRealtimeStats', 'getConnectionTypes', 'getSessionTimeseries',
      'getFunnelData', 'getFunnelConversions', 'getGoalConversions',
      'getGoalTrends', 'getAnnotations', 'getUptimeChecks', 'getAlerts',
      'getEmailReports'
    ];

    for (const qf of queryFunctions) {
      const re = new RegExp(`${qf}\\(siteId,`, 'g');
      content = content.replace(re, `${qf}(targetSiteId,`);
    }
  }

  fs.writeFileSync(file, content);
}

console.log('Updated dashboard routes');
