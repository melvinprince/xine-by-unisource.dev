// ============================================================
// Bot detection regression check.
//
//   npx tsx scripts/bot-detection-check.ts
//
// Run this after changing any weight in src/lib/bot-detection.ts. The
// "must NOT be flagged" block is the important half: those are real people
// whose traffic the previous filter deleted, and any weight change that
// flags one of them is a regression, not a tuning win.
// ============================================================

import { detectBot, hostMatchesDomain, BOT_SCORE_THRESHOLD } from "../src/lib/bot-detection";
import { getClientIp } from "../src/lib/client-ip";
import type { NextRequest } from "next/server";

type Case = {
  name: string;
  expectBot: boolean;
  ua: string;
  headers: Record<string, string>;
  payload?: Record<string, unknown>;
  siteDomain?: string;
  flood?: boolean;
  clientBotHint?: boolean;
};

const CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";
const FIREFOX =
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
const OLD_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Safari/605.1.15";

const beaconHeaders = {
  "sec-fetch-mode": "no-cors",
  "sec-fetch-dest": "empty",
  "sec-fetch-site": "cross-site",
  "accept-language": "en-GB,en;q=0.9",
  accept: "*/*",
  origin: "https://example.com",
};

const goodPayload = {
  browser: "Chrome",
  os: "Windows",
  device: "desktop",
  screen: "2560x1440",
  timezone: "Europe/London",
  language: "en-GB",
};

const cases: Case[] = [
  // ---------- must NOT be flagged (real people) ----------
  { name: "Chrome desktop, full beacon", expectBot: false, ua: CHROME, headers: beaconHeaders, payload: goodPayload, siteDomain: "example.com" },
  {
    name: "Privacy browser: no accept-language",
    expectBot: false,
    ua: CHROME,
    headers: { ...beaconHeaders, "accept-language": "" },
    payload: goodPayload,
    siteDomain: "example.com",
  },
  {
    name: "Old Safari 15: no Sec-Fetch-* at all",
    expectBot: false,
    ua: OLD_SAFARI,
    headers: { accept: "*/*", "accept-language": "en-US", origin: "https://example.com" },
    payload: { ...goodPayload, browser: "Safari", os: "macOS" },
    siteDomain: "example.com",
  },
  {
    name: "iOS Safari, no sec-ch-ua (cross-origin)",
    expectBot: false,
    ua: SAFARI_IOS,
    headers: beaconHeaders,
    payload: { browser: "Safari", os: "iOS", device: "mobile", screen: "390x844", timezone: "Europe/London", language: "en-GB" },
    siteDomain: "example.com",
  },
  {
    name: "Firefox, no client hints",
    expectBot: false,
    ua: FIREFOX,
    headers: beaconHeaders,
    payload: { ...goodPayload, browser: "Firefox", os: "Linux" },
    siteDomain: "example.com",
  },
  {
    name: "Duration beacon (no environment fields)",
    expectBot: false,
    ua: CHROME,
    headers: beaconHeaders,
    payload: {},
    siteDomain: "example.com",
  },
  {
    name: "Behind CGNAT: flood signal alone",
    expectBot: false,
    ua: CHROME,
    headers: beaconHeaders,
    payload: goodPayload,
    siteDomain: "example.com",
    flood: true,
  },
  {
    name: "Misconfigured domain (www vs apex) only",
    expectBot: false,
    ua: CHROME,
    headers: { ...beaconHeaders, origin: "https://shop.example.com" },
    payload: goodPayload,
    siteDomain: "example.com",
  },
  {
    name: "Wrong registered domain entirely, otherwise perfect browser",
    expectBot: false,
    ua: CHROME,
    headers: { ...beaconHeaders, origin: "https://totally-different.io" },
    payload: goodPayload,
    siteDomain: "example.com",
  },
  {
    name: "Referrer that the old keyword list would have killed",
    expectBot: false,
    ua: CHROME,
    headers: { ...beaconHeaders, referer: "https://learn.microsoft.com/en-us/azure/" },
    payload: goodPayload,
    siteDomain: "example.com",
  },
  {
    name: "localhost dev",
    expectBot: false,
    ua: CHROME,
    headers: { ...beaconHeaders, origin: "http://localhost:3000" },
    payload: goodPayload,
    siteDomain: "example.com",
  },
  {
    // Slack/Notion/Discord/VS Code all embed a real user-driven browser.
    name: "Electron desktop app (real person in an embedded browser)",
    expectBot: false,
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Slack/4.36.0 Chrome/126.0.0.0 Electron/31.0.0 Safari/537.36",
    headers: beaconHeaders,
    payload: goodPayload,
    siteDomain: "example.com",
  },
  {
    name: "Cubot phone — old regex flagged this real device",
    expectBot: false,
    ua: "Mozilla/5.0 (Linux; Android 13; CUBOT NOTE 40) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    headers: beaconHeaders,
    payload: { browser: "Chrome", os: "Android", device: "mobile", screen: "393x873", timezone: "Europe/London", language: "en-GB" },
    siteDomain: "example.com",
  },

  // ---------- must be flagged ----------
  { name: "Missing UA", expectBot: true, ua: "", headers: beaconHeaders, payload: goodPayload },
  {
    name: "Googlebot",
    expectBot: true,
    ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    headers: beaconHeaders,
    payload: goodPayload,
  },
  {
    name: "HeadlessChrome",
    expectBot: true,
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    headers: beaconHeaders,
    payload: goodPayload,
  },
  {
    name: "curl replay",
    expectBot: true,
    ua: "curl/8.4.0",
    headers: {},
    payload: goodPayload,
  },
  {
    name: "python-requests replay",
    expectBot: true,
    ua: "python-requests/2.31.0",
    headers: {},
    payload: goodPayload,
  },
  {
    name: "Tracker self-report (navigator.webdriver)",
    expectBot: true,
    ua: CHROME,
    headers: beaconHeaders,
    payload: goodPayload,
    clientBotHint: true,
  },
  {
    name: "Spoofed Chrome UA, no Sec-Fetch-*, no headers",
    expectBot: true,
    ua: CHROME,
    headers: {},
    payload: goodPayload,
  },
  {
    name: "Puppeteer-stealth: real UA, default 800x600 viewport, no timezone",
    expectBot: true,
    ua: CHROME,
    headers: beaconHeaders,
    payload: { browser: "Chrome", os: "Windows", device: "desktop", screen: "800x600", timezone: "", language: "" },
    siteDomain: "example.com",
  },
  {
    name: "Forged payload: claims Firefox but UA is Chrome, wrong domain",
    expectBot: true,
    ua: CHROME,
    headers: { ...beaconHeaders, origin: "https://attacker.test" },
    payload: { ...goodPayload, browser: "Firefox" },
    siteDomain: "example.com",
  },
  {
    name: "Injected data: wrong domain + flood",
    expectBot: true,
    ua: CHROME,
    headers: { ...beaconHeaders, origin: "https://attacker.test" },
    payload: goodPayload,
    siteDomain: "example.com",
    flood: true,
  },
];

let failed = 0;
console.log(`threshold = ${BOT_SCORE_THRESHOLD}\n`);
for (const c of cases) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.headers)) if (v) lower[k.toLowerCase()] = v;

  const verdict = detectBot({
    userAgent: c.ua,
    header: (n) => lower[n.toLowerCase()] ?? null,
    payload: c.payload ?? {},
    siteDomain: c.siteDomain,
    floodSuspected: c.flood,
    clientBotHint: c.clientBotHint,
  });

  const ok = verdict.isBot === c.expectBot;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}\n      bot=${verdict.isBot} score=${verdict.score} reason=${verdict.reason} [${verdict.signals.join(", ")}]`
  );
}

// domain matching
const domainCases: [string, string, boolean][] = [
  ["example.com", "example.com", true],
  ["www.example.com", "example.com", true],
  ["app.example.com", "example.com", true],
  ["example.com", "www.example.com", true],
  ["notexample.com", "example.com", false],
  ["example.com.attacker.io", "example.com", false],
  ["example.com:443", "example.com", true],
];
console.log("\ndomain matching:");
for (const [host, domain, expected] of domainCases) {
  const got = hostMatchesDomain(host, domain);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${host} vs ${domain} -> ${got}`);
}

// ---- Client IP resolution ----
// The client IP feeds both the visitor hash and the abuse ceiling, so a
// spoofable value here corrupts visitor counts. Assumes TRUSTED_PROXY_HOPS=1.
function mockRequest(headers: Record<string, string>): NextRequest {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return { headers: { get: (n: string) => lower[n.toLowerCase()] ?? null } } as NextRequest;
}

const ipCases: [string, Record<string, string>, string][] = [
  ["cf-connecting-ip wins over forged XFF", { "cf-connecting-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }, "9.9.9.9"],
  ["x-real-ip wins over forged XFF", { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" }, "9.9.9.9"],
  ["XFF read from the right, not the left", { "x-forwarded-for": "1.2.3.4, 203.0.113.7" }, "203.0.113.7"],
  ["single-entry XFF", { "x-forwarded-for": "203.0.113.7" }, "203.0.113.7"],
  ["forged XFF chain cannot push past the trusted hop", { "x-forwarded-for": "evil, evil2, 203.0.113.7" }, "203.0.113.7"],
  ["IPv6 with brackets", { "x-forwarded-for": "[2001:db8::1]" }, "2001:db8::1"],
  ["no headers at all", {}, ""],
];

console.log("\nclient IP resolution:");
for (const [name, headers, expected] of ipCases) {
  const got = getClientIp(mockRequest(headers));
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} -> "${got}"${ok ? "" : ` (expected "${expected}")`}`);
}

console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILURES"}`);
process.exit(failed === 0 ? 0 : 1);
