// ============================================================
// Xine — Bot Detection
//
// Design rules, in priority order:
//
//  1. NEVER destroy data. Classification only ever sets a flag; the caller
//     still writes the row. A false positive costs a hidden row (recoverable
//     with an UPDATE), never a deleted visit.
//  2. No single soft signal can classify on its own. Soft signals accumulate
//     toward BOT_SCORE_THRESHOLD; each one is weighted below the threshold so
//     that one flaky header can never flag a real person.
//  3. Only signals a real browser cannot plausibly be missing are "definitive".
//  4. Every decision records WHY (reason + score + signal list) so the filter
//     can be measured and tuned against real traffic instead of guessed at.
//
// Deliberately NOT used as signals:
//   - Referrer keyword blocklists. Substring matching deletes real traffic
//     ("learn" contains "earn", "Seoul" contains "seo", newsletter click
//     trackers contain "click"), and the referrer of a direct visit falls back
//     to the customer's own domain.
//   - Missing Sec-CH-UA. Client hints are NOT sent on cross-origin subresource
//     requests unless delegated via Accept-CH, so a legitimate cross-origin
//     beacon routinely lacks them. Present = positive signal; absent = nothing.
//   - Missing Accept-Language alone. It is stripped by Brave's farbling, Tor
//     Browser, hardened Firefox and some corporate proxies. Soft signal only.
// ============================================================

import { isbot } from "isbot";

/** Score at or above which a request is flagged as a bot. */
export const BOT_SCORE_THRESHOLD = 60;

/** Score assigned to a definitive (non-heuristic) match. */
const DEFINITIVE_SCORE = 100;

export type BotReason =
  | "ua_missing"
  | "ua_crawler"
  | "ua_automation"
  | "client_declared"
  | "heuristic"
  | null;

export interface BotVerdict {
  isBot: boolean;
  /** Primary reason, or null when the request looks human. */
  reason: BotReason;
  /** 0-100. Retained even for human traffic so thresholds can be tuned later. */
  score: number;
  /** Individual signals that fired, for debugging and tuning. */
  signals: string[];
}

/** Shape of the client-reported fields we cross-check against the User-Agent. */
export interface ClientPayloadHints {
  browser?: unknown;
  os?: unknown;
  device?: unknown;
  screen?: unknown;
  timezone?: unknown;
  language?: unknown;
}

export interface DetectionInput {
  userAgent: string;
  /** Lower-cased header lookup. */
  header: (name: string) => string | null;
  payload: ClientPayloadHints;
  /** Registered domain for the site this payload claims to belong to. */
  siteDomain?: string;
  /** ISO country of the client IP as resolved by the edge (cf-ipcountry). */
  country?: string;
  /** True when the request tripped the soft request-rate ceiling. */
  floodSuspected?: boolean;
  /**
   * The tracker's own in-page verdict (navigator.webdriver, automation UA).
   * The tracker reports rather than suppresses so that bot volume stays
   * measurable instead of invisible.
   */
  clientBotHint?: boolean;
}

// ---- Automation frameworks that identify themselves in the UA ----
// isbot covers declared crawlers; these are the headless/driver runtimes and
// bare HTTP clients it does not always classify, and that a scraper has to
// actively strip.
//
// Deliberately absent: "Electron/". Slack, Discord, Notion, VS Code and many
// other desktop apps embed a real, user-driven browser and put Electron in
// their UA — treating it as automation would delete those people. A scraping
// Electron app still has to pass the weighted signals below.
const AUTOMATION_UA =
  /headlesschrome|puppeteer|playwright|phantomjs|selenium|webdriver|cypress|jsdom|node-fetch|python-requests|axios\/|okhttp|curl\/|wget\/|libwww|go-http-client/i;

// Viewport sizes that are framework defaults rather than real displays.
// 800x600 is Puppeteer's default; 0x0 means no real screen was present.
const HEADLESS_SCREENS = new Set(["800x600", "0x0", "1x1", "x"]);

// Timezones a browser reports when it runs on a server or in a container
// rather than on a consumer device configured for a locale.
const SERVER_TIMEZONES = new Set(["utc", "etc/utc", "etc/gmt", "gmt", "etc/unknown", "etc/universal", "universal", "zulu"]);
const UTC_TOLERANT_OS = new Set(["linux", "android", "chromeos"]);

// China observes a single zone, so these IANA names only appear on devices
// set up for mainland China. Hong Kong, Macau and Taiwan have their own
// zones but are included as countries because cross-border use is routine.
const CHINA_TIMEZONES = new Set(["asia/shanghai", "asia/chongqing", "asia/chungking", "asia/harbin", "asia/urumqi", "prc"]);
const GREATER_CHINA_COUNTRIES = new Set(["CN", "HK", "MO", "TW"]);

function str(val: unknown): string {
  return typeof val === "string" ? val : "";
}

/**
 * Extract the major version of a Chromium-based browser from the UA.
 * Returns 0 when the UA is not Chromium or has no parsable version.
 */
function chromiumMajorVersion(ua: string): number {
  const match = /Chrome\/(\d+)/i.exec(ua);
  if (!match) return 0;
  return parseInt(match[1], 10) || 0;
}

/**
 * Normalise a hostname for comparison: strip port, lowercase, drop a leading
 * "www.". Returns "" for anything unparsable.
 */
export function normalizeHost(value: string): string {
  if (!value) return "";
  let host = value.trim().toLowerCase();
  // Accept full URLs, bare origins and bare hostnames alike.
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      return "";
    }
  } else {
    host = host.split("/")[0];
  }
  host = host.split(":")[0];
  return host.replace(/^www\./, "");
}

/**
 * True when `host` is the registered domain or any subdomain of it.
 * Subdomains are accepted so that a site registered as "example.com" keeps
 * receiving data from "app.example.com" and "staging.example.com".
 */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith("." + d);
}

// One DNS label per dot: 1-63 chars, no leading/trailing hyphen, no empty
// labels (so "example..com" fails). The TLD is alphabetic or an IDN
// ("xn--") label, which is what new URL() produces for unicode domains.
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * True for a syntactically valid, already-normalised hostname (lowercase, no
 * scheme/port/path). "localhost" and dotted IPv4 are accepted so a site
 * registered for local testing or a bare-IP install keeps working.
 */
export function isValidHostname(host: string): boolean {
  if (!host) return false;
  if (host === "localhost") return true;
  if (IPV4_RE.test(host)) return true;
  return HOSTNAME_RE.test(host);
}

/** Local development origins are never treated as a domain mismatch. */
function isLocalHost(host: string): boolean {
  const h = normalizeHost(host);
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local")
  );
}

/**
 * Classify a collect request.
 *
 * The caller is expected to persist the result alongside the row rather than
 * discarding the request — see the module header.
 */
export function detectBot(input: DetectionInput): BotVerdict {
  const { userAgent, header, payload, siteDomain, country, floodSuspected, clientBotHint } = input;
  const signals: string[] = [];

  // ---- Definitive checks -------------------------------------------------
  // Reserved for conditions a real browser cannot produce.

  if (clientBotHint) {
    return {
      isBot: true,
      reason: "client_declared",
      score: DEFINITIVE_SCORE,
      signals: ["client_declared"],
    };
  }

  if (!userAgent) {
    return {
      isBot: true,
      reason: "ua_missing",
      score: DEFINITIVE_SCORE,
      signals: ["ua_missing"],
    };
  }

  if (AUTOMATION_UA.test(userAgent)) {
    return {
      isBot: true,
      reason: "ua_automation",
      score: DEFINITIVE_SCORE,
      signals: ["ua_automation"],
    };
  }

  if (isbot(userAgent)) {
    return {
      isBot: true,
      reason: "ua_crawler",
      score: DEFINITIVE_SCORE,
      signals: ["ua_crawler"],
    };
  }

  // ---- Weighted soft signals --------------------------------------------
  // Every weight below is < BOT_SCORE_THRESHOLD by construction: no single
  // signal here can flag a visitor on its own.

  let score = 0;
  const add = (points: number, name: string) => {
    score += points;
    signals.push(name);
  };

  // -- Fetch Metadata --
  // Sec-Fetch-* is sent on every request (including cross-origin beacons) by
  // Chromium 76+, Firefox 90+ and Safari 16.4+. We only require it when the UA
  // claims a Chromium version that definitely sends it, so older/other engines
  // are never penalised for its absence.
  const secFetchMode = header("sec-fetch-mode");
  const secFetchDest = header("sec-fetch-dest");
  const chromiumVersion = chromiumMajorVersion(userAgent);

  if (secFetchMode || secFetchDest) {
    // Present and consistent with a beacon/fetch from page context.
    if (secFetchDest && secFetchDest !== "empty") {
      add(25, "sec_fetch_dest_unexpected");
    }
  } else if (chromiumVersion >= 90) {
    // UA claims a Chromium that always sends these headers, yet they are gone.
    add(40, "sec_fetch_missing_on_chromium");
  }

  // Sec-CH-UA is a *positive* signal only. It is frequently absent on
  // legitimate cross-origin requests, so absence is never penalised.
  const secChUa = header("sec-ch-ua");
  if (secChUa && chromiumVersion >= 90) {
    score -= 15;
    signals.push("sec_ch_ua_present");
  }

  // -- Transport headers --
  if (!header("accept-language")) add(15, "accept_language_missing");
  if (!header("accept")) add(10, "accept_missing");

  // -- User-Agent vs. client-reported environment --
  // The tracker derives these in the browser; a replayed or forged payload
  // rarely keeps them consistent with the UA it sends.
  const ua = userAgent.toLowerCase();
  const claimedBrowser = str(payload.browser).toLowerCase();
  const claimedOs = str(payload.os).toLowerCase();

  const BROWSER_UA_TOKENS: Record<string, string[]> = {
    chrome: ["chrome", "crios"],
    firefox: ["firefox", "fxios"],
    safari: ["safari"],
    edge: ["edg"],
    opera: ["opr", "opera"],
  };
  const expectedBrowserTokens = BROWSER_UA_TOKENS[claimedBrowser];
  if (expectedBrowserTokens && !expectedBrowserTokens.some((t) => ua.includes(t))) {
    add(30, "browser_ua_mismatch");
  }

  const OS_UA_TOKENS: Record<string, string[]> = {
    windows: ["windows"],
    macos: ["mac os", "macintosh"],
    linux: ["linux", "x11"],
    android: ["android"],
    // iPadOS in desktop mode sends a Macintosh UA; the tracker tells it apart
    // by touch support and reports it as iOS.
    ios: ["iphone", "ipad", "ipod", "macintosh"],
    chromeos: ["cros"],
  };
  const expectedOsTokens = OS_UA_TOKENS[claimedOs];
  if (expectedOsTokens && !expectedOsTokens.some((t) => ua.includes(t))) {
    add(30, "os_ua_mismatch");
  }

  // -- Browser environment fidelity --
  // Only meaningful for pageviews, which is where the tracker sends them.
  // Events and duration beacons omit these fields entirely, so an empty
  // payload object contributes nothing.
  const hasEnvironmentFields =
    payload.screen !== undefined ||
    payload.timezone !== undefined ||
    payload.language !== undefined;

  if (hasEnvironmentFields) {
    const screen = str(payload.screen).toLowerCase();
    if (!screen) add(20, "screen_missing");
    // An exact match against a known framework-default viewport is a much
    // stronger signal than a merely-absent field: screen.width/height report
    // the physical display on real hardware, so 800x600/0x0 means there
    // wasn't one. Still below the threshold on its own.
    else if (HEADLESS_SCREENS.has(screen)) add(35, "screen_headless_default");
    // Physical desktop displays are not square; headless fleets that
    // randomise the viewport often set width == height (1366x1366 was a
    // 17k-pageview proxy crawler on the live install). Phones and tablets
    // are excluded because some report a square box mid-rotation.
    else if (str(payload.device).toLowerCase() === "desktop") {
      const [w, h] = screen.split("x").map((n) => parseInt(n, 10));
      if (w >= 600 && w === h) add(35, "screen_square");
    }

    const timezone = str(payload.timezone).toLowerCase();
    if (!timezone) add(15, "timezone_missing");
    // Consumer Chromium/Safari installs take the zone from the OS, which is
    // set to a locale; UTC is what servers and containers default to. Linux
    // desktops (and the Linux-based Android/ChromeOS, which the tracker used
    // to report as Linux) and privacy browsers (Tor, Firefox
    // resistFingerprinting) legitimately report UTC, so they are not penalised.
    else if (
      SERVER_TIMEZONES.has(timezone) &&
      !UTC_TOLERANT_OS.has(claimedOs) &&
      claimedBrowser !== "firefox"
    ) {
      add(25, "timezone_utc");
    }
    // A mainland-China zone on an IP outside Greater China is either a VPN
    // user (common — must stay human) or a proxy fleet run from China. It
    // only ever adds to another anomaly, never flags on its own.
    if (CHINA_TIMEZONES.has(timezone) && country && !GREATER_CHINA_COUNTRIES.has(country.toUpperCase())) {
      add(25, "timezone_country_mismatch");
    }
    if (!str(payload.language)) add(10, "language_missing");
  }

  // -- Origin / domain provenance --
  // The api_key is public (it ships in the script tag), so payloads can be
  // forged from anywhere. A mismatch is weighted heavily but NOT definitively:
  // a misconfigured site domain must not silently hide a real visitor. At 45
  // points a mismatch alone stays visible, but combined with any other
  // anomaly it crosses the threshold.
  //
  // A registered domain that is not a valid hostname (the live install had
  // "fixingenvironment..com") can never match any origin, so checking it
  // would put +45 on every single hit for that site. Fail open instead and
  // leave a zero-weight marker so the misconfiguration stays visible.
  if (siteDomain && !isValidHostname(normalizeHost(siteDomain))) {
    signals.push("site_domain_invalid");
  } else if (siteDomain) {
    const originHeader = header("origin") || "";
    const refererHeader = header("referer") || "";
    const claimedHost = normalizeHost(originHeader) || normalizeHost(refererHeader);

    if (claimedHost && !isLocalHost(claimedHost)) {
      if (!hostMatchesDomain(claimedHost, siteDomain)) {
        add(45, "origin_domain_mismatch");
      }
    }
  }

  // -- Request flood --
  // Set by the caller's soft rate limiter. Weighted below the threshold on
  // purpose: shared IPs (CGNAT, offices, schools) legitimately produce high
  // request volume, so a flood alone must never flag a visitor.
  if (floodSuspected) add(35, "request_flood");

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  const isBot = score >= BOT_SCORE_THRESHOLD;

  return {
    isBot,
    reason: isBot ? "heuristic" : null,
    score,
    signals,
  };
}

const KNOWN_REASONS = new Set<string>(["ua_missing", "ua_crawler", "ua_automation", "client_declared", "heuristic"]);

/**
 * Upgrade a per-request verdict with the verdict of the session the request
 * belongs to.
 *
 * Event and duration beacons carry no screen/timezone/language, so the
 * environment signals that flagged a pageview cannot fire on them and they
 * would otherwise be written as human rows attached to a bot session. The
 * inheritance only ever upgrades (human -> bot), never the reverse, so a
 * forged session id can at worst hide the forger's own events.
 */
export function inheritSessionVerdict(
  verdict: BotVerdict,
  session: { reason: string | null; score: number | null }
): BotVerdict {
  if (verdict.isBot) return verdict;
  const prefix = (session.reason || "").split(":")[0];
  const reason = (KNOWN_REASONS.has(prefix) ? prefix : "heuristic") as BotReason;
  return {
    isBot: true,
    reason,
    score: Math.min(100, Math.max(verdict.score, session.score ?? BOT_SCORE_THRESHOLD)),
    signals: ["session_inherited", ...verdict.signals],
  };
}

/**
 * Serialise the signal list for the bot_reason column.
 * Format: "reason:signal1,signal2" truncated to the column width (64).
 *
 * Human verdicts that still tripped soft signals are recorded as
 * "human:signal1,..." (design rule 4) so near-misses and false negatives can
 * be audited later; only bot_score survived for them before. Bot audits group
 * on the prefix and filter is_bot = true, so they are unaffected.
 */
export function encodeBotReason(verdict: BotVerdict): string | null {
  const detail = verdict.signals.join(",");
  if (!verdict.reason) {
    return detail ? `human:${detail}`.slice(0, 64) : null;
  }
  const encoded = detail ? `${verdict.reason}:${detail}` : verdict.reason;
  return encoded.slice(0, 64);
}
