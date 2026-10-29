(function () {
  "use strict";

  // Double-include guard. The snippet ending up on a page twice (theme plus
  // plugin, GTM plus hard-coded) used to start two trackers: every pageview
  // was counted twice and every visit looked like a two-page non-bounce.
  if (window.__xine_loaded) return;
  window.__xine_loaded = true;

  // Public API stub, installed before any early return so a site calling
  // wa.track() during load never throws. Calls made before the tracker is
  // running are queued and replayed once the first pageview has been sent
  // (an inline `window.wa = {q: [], track: ...}` stub in the page is taken
  // over the same way). A primitive window.wa (e.g. a string from another
  // script) is replaced: assigning a property to it throws in strict mode,
  // which previously killed the tracker before the first pageview.
  var wa = window.wa;
  if (!wa || (typeof wa !== "object" && typeof wa !== "function")) {
    wa = {};
    try { window.wa = wa; } catch (e) {}
  }
  var waQueue = Array.isArray(wa.q) ? wa.q : [];
  try {
    wa.q = waQueue;
    if (typeof wa.track !== "function") wa.track = function () { waQueue.push(arguments); };
  } catch (e) {}

  // Bot hint, reported to the server rather than used to suppress the beacon.
  // Suppressing here made bot volume invisible and therefore untunable; the
  // server records the hint and flags the row instead.
  //
  // Word-boundary anchored on purpose: the previous unanchored /bot|.../ also
  // matched real devices ("Cubot" phones) and real users ("yahoo" in the Yahoo
  // app webview), silently dropping them.
  var BOT_UA = /(^|[^a-z])(bot|googlebot|bingbot|yandexbot|duckduckbot|baiduspider|ahrefsbot|semrushbot|mj12bot|dotbot|crawler|spider|crawling|lighthouse|headlesschrome|phantomjs|slurp)([^a-z]|$)/i;
  var botHint = BOT_UA.test(navigator.userAgent) || navigator.webdriver === true;

  // Opt-out only. Note what is deliberately NOT excluded here:
  //   - navigator.connection.saveData: data-saver users are real people.
  //   - prerender: handled properly below via document.prerendering rather
  //     than the long-obsolete "prerender" visibilityState, which modern
  //     Chrome speculation-rules prerendering never produces.
  if (window.location.search.indexOf("no_track=1") !== -1) {
    return;
  }

  // document.currentScript is null for type=module scripts and for scripts
  // re-executed by Cloudflare Rocket Loader or Partytown, which used to make
  // the tracker exit silently. Fall back to our own tag, identified by the
  // api key attribute plus a t.js src, so an unrelated vendor script that
  // also happens to carry data-api-key is never picked up.
  var scriptEl = document.currentScript;
  if (!scriptEl) {
    try {
      var tags = document.querySelectorAll("script[data-api-key]");
      for (var ti = 0; ti < tags.length; ti++) {
        if (/\/t\.js(?:[?#].*)?$/.test(tags[ti].src || "")) { scriptEl = tags[ti]; break; }
      }
    } catch (e) {}
  }
  if (!scriptEl) return;

  var apiKey = scriptEl.getAttribute("data-api-key");
  if (!apiKey) return;

  // Local development, preview builds and saved pages often embed the
  // production api key. Their traffic used to be recorded as real human
  // visits under the production paths. Opt back in with data-track-localhost
  // when testing the tracker itself.
  var host = location.hostname || "";
  if (
    (location.protocol === "file:" || /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/i.test(host)) &&
    !scriptEl.hasAttribute("data-track-localhost")
  ) {
    return;
  }

  // Endpoint discovery. The app's routes live at the root next to t.js, so
  // the base is the script URL minus "/t.js". When the file is proxied under
  // another name (a common ad-blocker workaround) that replace matched
  // nothing and every beacon was POSTed to the static file itself; fall back
  // to the script's origin instead. An explicit data-endpoint wins for both
  // collect and config, so a first-party proxy also gets feature flags.
  var src = scriptEl.src || "";
  var base = /\/t\.js(?:[?#].*)?$/.test(src)
    ? src.replace(/\/t\.js(?:[?#].*)?$/, "")
    : (function () { try { return new URL(src, location.href).origin; } catch (e) { return ""; } })();
  var customEndpoint = scriptEl.getAttribute("data-endpoint");
  var endpoint = customEndpoint || base + "/api/collect";
  var configBase = customEndpoint && /\/api\/collect\/?$/.test(customEndpoint)
    ? customEndpoint.replace(/\/api\/collect\/?$/, "")
    : base;
  var configEndpoint = configBase + "/api/config/" + encodeURIComponent(apiKey);

  // Snapshot of the landing state, taken when the script executes. Consent
  // tools and frameworks often history.replaceState() the UTM / click-id
  // query away early in page life; reading it later lost the campaign.
  var initialSearch = location.search;
  var initialReferrer = document.referrer || "";
  var initialNavType = (function () {
    try {
      var n = performance.getEntriesByType("navigation")[0];
      if (n && n.type) return n.type;
    } catch (e) {}
    try {
      var t = performance.navigation && performance.navigation.type;
      if (t === 1) return "reload";
      if (t === 2) return "back_forward";
    } catch (e) {}
    return "";
  })();
  // LCP is meaningless for a page that loaded in a background tab: the
  // largest paint happens whenever the user first looks at it. (A prerender
  // is hidden until activation, which is not the same thing.)
  var hiddenAtLoad = !document.prerendering && document.visibilityState === "hidden";

  // Core tracking: identity, environment, pageviews, engaged time and the
  // SPA hooks. Runs as soon as the page is eligible (immediately, or on
  // prerender activation). It used to wait for requestIdleCallback with no
  // timeout, which on a busy main thread held the first pageview back for
  // seconds and lost fast bounces entirely.
  var start = function () {
    var vid, sid;
    try {
      vid = crypto.randomUUID();
      sid = crypto.randomUUID();
    } catch (e) {
      vid = Math.random().toString(36).substring(2);
      sid = Math.random().toString(36).substring(2);
    }

    // Environment detection. Order matters throughout: platform- and
    // vendor-specific tokens must be tested before the generic ones they
    // contain. Android UAs say "Linux; Android", iOS UAs say "like Mac OS X",
    // Chrome/Firefox on iOS say CriOS/FxiOS (and "Safari"), and Samsung
    // Internet, Edge and Opera all carry "Chrome/". The old chain tested the
    // generic tokens first, so Android was reported as Linux, iOS as macOS
    // and Chrome on iPhone as Safari.
    var ua = navigator.userAgent;
    // iPadOS 13+ Safari sends a desktop Macintosh UA; touch support is the
    // only client-side tell (no Mac has a touch screen).
    var isIPadOS = /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
    var isIOS = /iPhone|iPad|iPod/.test(ua) || isIPadOS;
    var isAndroid = /Android/.test(ua);

    var browser =
      /Edg(e|A|iOS)?\//.test(ua) ? "Edge"
        : /OPR\/|Opera/.test(ua) ? "Opera"
        : /SamsungBrowser/.test(ua) ? "Samsung Internet"
        : /YaBrowser/.test(ua) ? "Yandex"
        : /FxiOS|Firefox/.test(ua) ? "Firefox"
        : /CriOS|Chrome\/|Chromium/.test(ua) ? "Chrome"
        : /Safari/.test(ua) ? "Safari"
        : "Other";

    var os = isIOS ? "iOS"
      : isAndroid ? "Android"
      : /Windows/.test(ua) ? "Windows"
      : /CrOS/.test(ua) ? "ChromeOS"
      : /Mac OS|Macintosh/.test(ua) ? "macOS"
      : /Linux|X11/.test(ua) ? "Linux"
      : "Unknown";

    // Android tablets rarely say "Tablet"; what they lack is the "Mobile"
    // token every Android phone browser sends.
    var device = /iPad/.test(ua) || isIPadOS || /Tablet|PlayBook|Silk|Kindle/i.test(ua) || (isAndroid && !/Mobile/.test(ua)) ? "tablet"
      : /Mobi|iPhone|iPod|Android/i.test(ua) ? "mobile"
      : "desktop";

    var screenRes = screen.width + "x" + screen.height;
    var lang = navigator.language || "";
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}

    var connType = navigator.connection ? navigator.connection.effectiveType || "" : "";

    // currentUrl is the URL of the last *recorded* pageview; duration
    // beacons are matched to that row by URL, so it only changes when a
    // pageview is sent. lastSeenUrl also follows URL changes we deliberately
    // did not count (a replaceState that only strips the query), so that a
    // later fragment-only popstate is not mistaken for a navigation.
    var currentUrl = "";
    var lastSeenUrl = "";
    // URL of the hard navigation (first pageview). Web vitals belong to it,
    // even when the config fetch resolves after the user has already moved
    // to another SPA route.
    var landingUrl = "";
    var isFirstPageview = true;
    var scrollDepthsMeasured = {};

    // Hash routers ("#/route", "#!/route") keep path+search constant, so
    // their routes only show up in the fragment. Plain in-page anchors
    // ("#section") are not routes and are ignored.
    function routeHash() {
      return /^#!?\//.test(location.hash) ? location.hash : "";
    }
    function pageUrl() {
      return location.pathname + location.search + routeHash();
    }

    // Engaged time. The old clock was wall time since load, so a tab left in
    // the background for days reported days when it was finally closed, and a
    // bfcache restore kept counting from the original load. Time now only
    // accumulates while the document is visible.
    var MAX_DURATION = 1800; // seconds; matches the 30-minute session timeout
    var engagedMs = 0;
    var visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    var lastSentDuration = 0;

    function pauseClock() {
      if (visibleSince !== null) {
        engagedMs += Date.now() - visibleSince;
        visibleSince = null;
      }
    }
    function resumeClock() {
      if (visibleSince === null && document.visibilityState === "visible") visibleSince = Date.now();
    }
    function resetClock() {
      engagedMs = 0;
      lastSentDuration = 0;
      visibleSince = document.visibilityState === "visible" ? Date.now() : null;
    }
    function engagedSeconds() {
      var ms = engagedMs + (visibleSince !== null ? Date.now() - visibleSince : 0);
      return Math.min(Math.round(ms / 1000), MAX_DURATION);
    }

    function postJson(dataStr) {
      return fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: dataStr,
        keepalive: true
      });
    }

    // No permanent "blocked" latch here. sendBeacon returns false for a
    // transient condition (the user agent's queue is full), and latching on
    // that used to discard every later beacon on the page — which showed up
    // as pageviews with duration 0 and an inflated bounce rate. Fall back to
    // fetch instead and let individual sends fail on their own.
    function sendPayload(payload) {
      var dataStr;
      // Report our in-page bot verdict so the server can flag the row.
      if (botHint && payload.data) payload.data.bot_hint = 1;
      try {
        dataStr = JSON.stringify(payload);
      } catch (e) {
        return;
      }
      try {
        if (navigator.sendBeacon) {
          var sent = navigator.sendBeacon(endpoint, new Blob([dataStr], { type: "application/json" }));
          if (sent) return;
        }
        postJson(dataStr).catch(function () {});
      } catch (e) {
        try { postJson(dataStr).catch(function () {}); } catch (e2) {}
      }
    }

    // urlOverride pins an event to a specific page (web vitals belong to the
    // hard navigation, not to whatever SPA route is current when they flush).
    function sendEvent(eventName, properties, urlOverride) {
      sendPayload({
        api_key: apiKey,
        type: "event",
        data: {
          name: eventName,
          properties: properties || {},
          url: urlOverride || pageUrl(),
          visitor_id: vid,
          session_id: sid
        }
      });
    }

    // Sends the engaged seconds for the current page. The value only grows
    // within a page, so an unchanged value (hidden then pagehide, say) is not
    // re-sent; the server keeps the maximum it has seen.
    function sendDuration(urlStr) {
      var duration = engagedSeconds();
      if (duration < 1 || duration === lastSentDuration) return;
      lastSentDuration = duration;
      sendPayload({
        api_key: apiKey,
        type: "duration",
        data: {
          url: urlStr || currentUrl,
          duration: duration,
          session_id: sid
        }
      });
    }

    // UTM tags plus the paid-click ids Google and Microsoft Ads auto-tag
    // with. Those clicks usually carry no UTMs and a google.com / bing.com
    // referrer, so without this they were counted as organic search. Only
    // the presence of the id is used; its value is never sent separately.
    function campaignParams(search) {
      var params = {};
      try {
        var sp = new URLSearchParams(search);
        ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) {
          var val = sp.get(k);
          if (val) params[k] = val;
        });
        if (!params.utm_source) {
          if (sp.get("gclid") || sp.get("gbraid") || sp.get("wbraid")) {
            params.utm_source = "google";
            params.utm_medium = "cpc";
          } else if (sp.get("msclkid")) {
            params.utm_source = "bing";
            params.utm_medium = "cpc";
          }
        }
      } catch (e) {}
      return params;
    }

    // Returns true when a pageview was actually sent.
    function trackPageview() {
      var newUrl = pageUrl();
      if (newUrl === lastSeenUrl) return false;

      var first = isFirstPageview;
      isFirstPageview = false;

      // Close out the previous page before resetting the clock for this one.
      if (currentUrl) {
        pauseClock();
        sendDuration(currentUrl);
      }
      currentUrl = newUrl;
      lastSeenUrl = newUrl;
      if (first) landingUrl = newUrl;
      resetClock();
      scrollDepthsMeasured = {}; // Reset scroll depths for new page

      // Campaign tags come from the landing snapshot on the first pageview
      // (they may have been stripped from the live URL by now) and from the
      // live URL on later SPA navigations.
      var utms = campaignParams(first ? initialSearch : location.search);

      // document.referrer never changes during client-side navigation, and
      // the browser restores it on reload and back/forward. Re-sending it
      // made every SPA route, refresh and Back press count as another
      // google.com / bing.com arrival. It is sent only for the first
      // pageview of a genuine navigation (a prerender activation is one: it
      // is how search results pages open), and never when it is our own host.
      var ref = "";
      if (first && (initialNavType === "navigate" || initialNavType === "prerender" || initialNavType === "")) {
        ref = initialReferrer;
        try { if (ref && new URL(ref).hostname === location.hostname) ref = ""; } catch (e) {}
      }

      var pvData = {
        url: newUrl,
        referrer: ref,
        title: document.title,
        hostname: location.hostname,
        visitor_id: vid,
        session_id: sid,
        browser: browser,
        device: device,
        os: os,
        screen: screenRes,
        language: lang,
        timezone: tz,
        connection_type: connType
      };

      // TTFB belongs to the document load only. Attaching the original
      // navigation entry's value to every SPA pageview over-weighted the
      // first load in the averages. For an activated prerender the response
      // arrived before the user asked for the page, so it is measured from
      // activation (usually 0, which is then not sent).
      if (first) {
        try {
          var navEntries = performance.getEntriesByType("navigation");
          var navEntry = navEntries && navEntries[0];
          var ttfb = navEntry ? navEntry.responseStart - (navEntry.activationStart || 0) : 0;
          if (ttfb > 0) pvData.ttfb = Math.round(ttfb);
        } catch (e) {}
      }

      for (var k in utms) {
        if (Object.prototype.hasOwnProperty.call(utms, k)) pvData[k] = utms[k];
      }

      sendPayload({
        api_key: apiKey,
        type: "pageview",
        data: pvData
      });
      return true;
    }

    // Progressive heartbeat for accurate time-on-page
    // Fires at 5s, 15s, 30s after each page load. This captures real duration
    // even when exit beacons are blocked by ad-blockers, and naturally
    // separates human traffic (reaches 5s+) from bots (0-1s bounce).
    var heartbeatTimers = [];
    var heartbeatIntervals = [5, 15, 30];

    function startHeartbeats() {
      stopHeartbeats();
      heartbeatIntervals.forEach(function (secs) {
        heartbeatTimers.push(setTimeout(function () {
          if (document.visibilityState !== "hidden") {
            sendDuration(currentUrl);
          }
        }, secs * 1000));
      });
    }

    function stopHeartbeats() {
      heartbeatTimers.forEach(function (t) { clearTimeout(t); });
      heartbeatTimers = [];
    }

    // Heartbeats restart only when a pageview was actually recorded, so a
    // hook firing for an unchanged URL does not reset them mid-page.
    function navigate() {
      if (trackPageview()) startHeartbeats();
    }

    // SPA routing hooks. A trailing debounce records the URL the app settles
    // on: the old leading-edge 100ms throttle returned early on the second
    // of two quick pushState calls, so the final route of a redirect chain
    // was never tracked.
    var navTimer = null;
    function scheduleNav() {
      clearTimeout(navTimer);
      navTimer = setTimeout(function () {
        navTimer = null;
        navigate();
      }, 100);
    }

    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      var r = origPush.apply(this, arguments);
      scheduleNav();
      return r;
    };
    // replaceState is how sites strip ?utm_* / gclid and sync filter or
    // pagination state into the query; counting it doubled single-page
    // visits and turned bounces into non-bounces. It only counts when the
    // route itself (pathname, or a hash route) changes. A query-only replace
    // is remembered as seen so the next real navigation compares correctly,
    // unless a pushState is still pending: routers commonly follow
    // pushState('/b') with an immediate replaceState on the same path, and
    // the pending navigation must still be recorded.
    history.replaceState = function () {
      var before = location.pathname + routeHash();
      var r = origReplace.apply(this, arguments);
      if (location.pathname + routeHash() !== before) scheduleNav();
      else if (!isFirstPageview && navTimer === null) lastSeenUrl = pageUrl();
      return r;
    };
    window.addEventListener("popstate", scheduleNav);
    window.addEventListener("hashchange", scheduleNav);

    // Duration tracking on exit. pagehide replaces beforeunload: it fires
    // reliably on mobile and when a page enters the bfcache.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        pauseClock();
        sendDuration(currentUrl);
      } else {
        resumeClock();
      }
    });
    window.addEventListener("pagehide", function () {
      pauseClock();
      sendDuration(currentUrl);
    });
    // Restored from the back/forward cache: same page instance, so carry on
    // accumulating engaged time for it rather than starting a new pageview.
    window.addEventListener("pageshow", function (e) {
      if (e.persisted) resumeClock();
    });

    // Install the real public API, track the initial pageview, then replay
    // anything queued before we were running so it shares this session.
    var realTrack = function (name, props) {
      if (typeof name === "string" && name) sendEvent(name, props);
    };
    try { wa.track = realTrack; } catch (e) {}

    navigate();

    var queued = waQueue.splice(0, waQueue.length);
    queued.forEach(function (args) {
      try { realTrack(args[0], args[1]); } catch (e) {}
    });

    // Optional features are not on the critical path: wait for idle, but
    // never for long.
    if (window.requestIdleCallback) {
      window.requestIdleCallback(loadFeatures, { timeout: 2000 });
    } else {
      setTimeout(loadFeatures, 150);
    }

    // ==========================================
    // MODULE: OPT-IN FEATURES
    // ==========================================
    function loadFeatures() {
    fetch(configEndpoint)
      .then(function(res) { return res.json(); })
      .then(function(config) {
        var f = config.features || {};

        // 1. Web Vitals
        // Each metric is sent at most once per page load and attributed to
        // the landing URL. The CLS/INP hide listeners used to stay attached
        // after their observers disconnected, re-sending the same value on
        // every tab switch; LCP used to report its first candidate rather
        // than the final one.
        if (f.web_vitals) {
          var vitalsUrl = landingUrl || currentUrl;
          var vitalSent = {};
          var sendVital = function (metric, value) {
            if (vitalSent[metric] || value == null || !isFinite(value)) return;
            vitalSent[metric] = true;
            sendEvent("web_vital", { metric: metric, value: Math.round(value) }, vitalsUrl);
          };

          try {
            var fcpPo = new PerformanceObserver(function (list) {
              list.getEntries().forEach(function (e) {
                if (e.name === "first-contentful-paint") {
                  sendVital("FCP", e.startTime);
                  fcpPo.disconnect();
                }
              });
            });
            fcpPo.observe({ type: "paint", buffered: true });
          } catch (e) {}

          // LCP candidates keep arriving until the user interacts; the last
          // one before the first input (or the first hide) is the LCP.
          var lcpVal = null, lcpPo = null;
          var finalizeLcp = function () {
            if (lcpPo) {
              try {
                var pending = lcpPo.takeRecords();
                if (pending.length) lcpVal = pending[pending.length - 1].startTime;
              } catch (e) {}
              lcpPo.disconnect();
              lcpPo = null;
            }
            sendVital("LCP", lcpVal);
          };
          if (!hiddenAtLoad) {
            try {
              lcpPo = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                if (entries.length) lcpVal = entries[entries.length - 1].startTime;
              });
              lcpPo.observe({ type: "largest-contentful-paint", buffered: true });
              ["keydown", "pointerdown"].forEach(function (type) {
                window.addEventListener(type, finalizeLcp, { once: true, capture: true, passive: true });
              });
            } catch (e) { lcpPo = null; }
          }

          // CLS: largest session window (shifts < 1s apart, window < 5s),
          // as defined by Core Web Vitals, rather than the lifetime sum.
          // Only observed where layout-shift is actually supported: Safari and
          // Firefox accept the observe() call silently and would otherwise
          // report a CLS of 0 for every page load.
          var clsMax = 0, clsWindow = 0, clsFirst = 0, clsLast = 0, clsPo = null;
          var clsObserve = function (entries) {
            entries.forEach(function (e) {
              if (e.hadRecentInput) return;
              if (clsWindow && e.startTime - clsLast < 1000 && e.startTime - clsFirst < 5000) {
                clsWindow += e.value;
              } else {
                clsWindow = e.value;
                clsFirst = e.startTime;
              }
              clsLast = e.startTime;
              if (clsWindow > clsMax) clsMax = clsWindow;
            });
          };
          try {
            var entryTypes = PerformanceObserver.supportedEntryTypes || [];
            if (entryTypes.indexOf("layout-shift") !== -1) {
              clsPo = new PerformanceObserver(function (list) { clsObserve(list.getEntries()); });
              clsPo.observe({ type: "layout-shift", buffered: true });
            }
          } catch (e) { clsPo = null; }

          // INP: one duration per interaction (an interaction emits several
          // event entries), then the p98 across interactions.
          var interactions = {}, inpPo = null;
          try {
            inpPo = new PerformanceObserver(function (list) {
              list.getEntries().forEach(function (e) {
                if (e.interactionId) interactions[e.interactionId] = Math.max(interactions[e.interactionId] || 0, e.duration);
              });
            });
            inpPo.observe({ type: "event", buffered: true, durationThreshold: 40 });
          } catch (e) { inpPo = null; }

          var finalizeVitals = function () {
            finalizeLcp();
            // A page with no layout shift has a CLS of 0, which is the best
            // possible score; skipping it (as before) left only the pages
            // that did shift in the average and biased CLS upwards.
            if (clsPo) {
              try {
                var pendingShifts = clsPo.takeRecords();
                if (pendingShifts.length) clsObserve(pendingShifts);
              } catch (e) {}
              clsPo.disconnect();
              clsPo = null;
              sendVital("CLS", clsMax * 1000);
            }
            if (inpPo) {
              inpPo.disconnect();
              inpPo = null;
              var durations = Object.keys(interactions).map(function (id) { return interactions[id]; });
              if (durations.length > 0) {
                durations.sort(function (a, b) { return a - b; });
                var p98Index = Math.min(Math.ceil(durations.length * 0.98) - 1, durations.length - 1);
                sendVital("INP", durations[p98Index]);
              }
            }
          };
          document.addEventListener("visibilitychange", function () {
            if (document.visibilityState === "hidden") finalizeVitals();
          });
          window.addEventListener("pagehide", finalizeVitals);
        }

        // 2. Scroll Depth
        if (f.scroll_depth) {
          var scrollTimer = null;
          window.addEventListener("scroll", function () {
            if (!scrollTimer) {
              scrollTimer = setTimeout(function () {
                scrollTimer = null;
                var h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
                var vh = window.innerHeight;
                var y = window.scrollY || document.documentElement.scrollTop;
                var pct = Math.round(((y + vh) / h) * 100);
                [25, 50, 75, 100].forEach(function (dp) {
                  if (pct >= dp && !scrollDepthsMeasured[dp]) {
                    scrollDepthsMeasured[dp] = true;
                    sendEvent("scroll_depth", { depth: dp, url: currentUrl });
                  }
                });
              }, 300);
            }
          }, { passive: true });
        }

        // 3. Outbound Clicks
        if (f.outbound_clicks) {
          document.addEventListener("click", function (e) {
            var t = e.target;
            while (t && t.tagName !== "A") t = t.parentElement;
            if (t && t.href) {
              try {
                if (new URL(t.href).hostname !== location.hostname) {
                  sendEvent("outbound_click", { url: t.href, text: (t.textContent || "").substring(0, 100) });
                }
              } catch (err) {}
            }
          }, { passive: true, capture: true });
        }

        // 4. JS Errors
        if (f.js_errors) {
          window.addEventListener("error", function (e) {
            if (e.filename) {
              sendEvent("js_error", {
                message: (e.message || "").substring(0, 200),
                source: (e.filename || "").substring(0, 200),
                line: e.lineno,
                col: e.colno
              });
            }
          });
          window.addEventListener("unhandledrejection", function (e) {
            sendEvent("js_error", {
              message: ("Unhandled Promise: " + String(e.reason || "")).substring(0, 200),
              type: "promise"
            });
          });
        }

        // 5. Click Tracking
        if (f.click_tracking) {
          document.addEventListener('click', function(e) {
            var target = e.target;
            if (!target) return;
            var path = [];
            var current = target;
            while (current && current !== document.documentElement && path.length < 3) {
              var sel = current.tagName.toLowerCase();
              if (current.id) sel += '#' + current.id;
              if (current.className && typeof current.className === 'string') {
                sel += '.' + current.className.trim().split(/\s+/).join('.');
              }
              path.unshift(sel);
              current = current.parentElement;
            }
            sendEvent('click', {
              selector: path.join(' > ').substring(0, 200),
              x: e.clientX,
              y: e.clientY,
              url: currentUrl
            });
          }, { passive: true, capture: true });
        }

        // 6. Rage Clicks
        if (f.rage_clicks) {
          var clickLog = [];
          document.addEventListener('click', function(e) {
            var now = Date.now();
            clickLog.push({ x: e.clientX, y: e.clientY, time: now });
            clickLog = clickLog.filter(function(c) { return now - c.time < 2000; });
            if (clickLog.length >= 3) {
              var d = 0;
              for (var i = 1; i < clickLog.length; i++) {
                d += Math.abs(clickLog[i].x - clickLog[0].x) + Math.abs(clickLog[i].y - clickLog[0].y);
              }
              if (d < 50) { // clicks are within a 50px radius
                var target = e.target;
                var sel = target ? target.tagName.toLowerCase() : 'unknown';
                if (target && target.id) sel += '#' + target.id;
                sendEvent('rage_click', { selector: sel.substring(0, 50), x: e.clientX, y: e.clientY });
                clickLog = []; // reset to avoid spamming
              }
            }
          }, { passive: true, capture: true});
        }

        // 7. File Downloads
        if (f.file_downloads) {
          var extRegex = /\.(pdf|zip|doc|docx|xls|xlsx|ppt|pptx|txt|csv|tar|gz|exe|dmg)$/i;
          document.addEventListener('click', function(e) {
            var t = e.target;
            while (t && t.tagName !== "A") t = t.parentElement;
            if (t && t.href && extRegex.test(t.href)) {
              sendEvent('file_download', { url: t.href, text: (t.textContent || "").substring(0, 100) });
            }
          }, { passive: true, capture: true });
        }

        // 8. Form Abandonment
        if (f.form_abandonment) {
          var interactedForms = {};
          document.addEventListener('focusin', function(e) {
            var t = e.target;
            if (t && t.form) {
              var formId = t.form.id || t.form.name || t.form.action || 'unnamed_form';
              if (!interactedForms[formId]) {
                interactedForms[formId] = true;
                var submitHandler = function() { interactedForms[formId] = false; };
                t.form.addEventListener('submit', submitHandler);
              }
            }
          }, { passive: true, capture: true });

          window.addEventListener('beforeunload', function() {
            Object.keys(interactedForms).forEach(function(fid) {
              if (interactedForms[fid]) {
                sendEvent('form_abandoned', { form_id: fid });
              }
            });
          });
        }


      })
      // Optional-feature config only. A failure here (ad-blocker, transient
      // network error) must NOT stop core pageview/duration tracking — that
      // previously latched isBlocked and cost every duration beacon on the
      // page, inflating bounce rate.
      .catch(function () {});
    }

  };

  // Defer until a prerendered page is actually activated, so speculation-rules
  // prerenders are not counted as visits. If the prerender is never activated,
  // nothing is ever sent — which is the correct outcome.
  if (document.prerendering) {
    document.addEventListener("prerenderingchange", start, { once: true });
  } else {
    start();
  }

})();
