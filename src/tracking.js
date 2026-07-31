(function () {
  "use strict";

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

  var scriptEl = document.currentScript;
  if (!scriptEl) return;

  var apiKey = scriptEl.getAttribute("data-api-key");
  var endpoint = scriptEl.getAttribute("data-endpoint") || scriptEl.src.replace(/\/t\.js.*$/, "/api/collect");
  var configEndpoint = scriptEl.src.replace(/\/t\.js.*$/, "/api/config/" + apiKey);

  if (!apiKey) return;

  // Wait for idle to not block rendering
  var run = function () {
    var vid, sid;
    try {
      vid = crypto.randomUUID();
      sid = crypto.randomUUID();
    } catch (e) {
      vid = Math.random().toString(36).substring(2);
      sid = Math.random().toString(36).substring(2);
    }

    var ua = navigator.userAgent;
    var browser =
      ua.indexOf("OPR") > -1 || ua.indexOf("Opera") > -1 ? "Opera"
        : ua.indexOf("Edg") > -1 ? "Edge"
        : ua.indexOf("Firefox") > -1 ? "Firefox"
        : ua.indexOf("Chrome") > -1 ? "Chrome"
        : ua.indexOf("Safari") > -1 ? "Safari"
        : "Other";

    var device = /Mobi|Android/i.test(ua) && !/Tablet|iPad/i.test(ua) ? "mobile"
      : /Tablet|iPad/i.test(ua) ? "tablet"
      : "desktop";

    var os = ua.indexOf("Windows") > -1 ? "Windows"
      : ua.indexOf("Mac OS") > -1 ? "macOS"
      : ua.indexOf("Linux") > -1 ? "Linux"
      : ua.indexOf("Android") > -1 ? "Android"
      : /iPhone|iPad/.test(ua) ? "iOS"
      : "Unknown";

    var screenRes = screen.width + "x" + screen.height;
    var lang = navigator.language || "";
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}

    var connType = navigator.connection ? navigator.connection.effectiveType || "" : "";
    var currentUrl = "";
    var pageLoadTime = Date.now();

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

    function sendEvent(eventName, properties) {
      sendPayload({
        api_key: apiKey,
        type: "event",
        data: {
          name: eventName,
          properties: properties || {},
          url: location.pathname + location.search,
          visitor_id: vid,
          session_id: sid
        }
      });
    }

    function sendDuration(urlStr) {
      var duration = Math.round((Date.now() - pageLoadTime) / 1000);
      if (duration < 1) return;
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

    var lastPageviewTime = 0;
    function trackPageview() {
      var now = Date.now();
      if (now - lastPageviewTime < 100) return;
      var newUrl = location.pathname + location.search;
      if (newUrl === currentUrl) return;

      lastPageviewTime = now;
      if (currentUrl) sendDuration(currentUrl);
      currentUrl = newUrl;
      pageLoadTime = Date.now();
      scrollDepthsMeasured = {}; // Reset scroll depths for new page

      var utms = (function () {
        var params = {};
        try {
          var sp = new URLSearchParams(location.search);
          ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) {
            var val = sp.get(k);
            if (val) params[k] = val;
          });
        } catch (e) {}
        return params;
      })();

      var pvData = {
        url: newUrl,
        referrer: document.referrer,
        title: document.title,
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

      try {
        var navEntries = performance.getEntriesByType("navigation");
        if (navEntries && navEntries[0] && navEntries[0].responseStart > 0) {
          pvData.ttfb = Math.round(navEntries[0].responseStart);
        }
      } catch (e) {}

      if (utms.utm_source) pvData.utm_source = utms.utm_source;
      if (utms.utm_medium) pvData.utm_medium = utms.utm_medium;
      if (utms.utm_campaign) pvData.utm_campaign = utms.utm_campaign;

      sendPayload({
        api_key: apiKey,
        type: "pageview",
        data: pvData
      });
    }

    // SPA Routing hooks
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      origPush.apply(this, arguments);
      setTimeout(trackPageview, 50);
    };
    history.replaceState = function () {
      origReplace.apply(this, arguments);
      setTimeout(trackPageview, 50);
    };
    window.addEventListener("popstate", function () { setTimeout(trackPageview, 50); });

    // Duration tracking on exit
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") sendDuration(currentUrl);
    });
    window.addEventListener("beforeunload", function () {
      sendDuration(currentUrl);
    });

    // Progressive heartbeat for accurate time-on-page
    // Fires at 5s, 15s, 30s after each page load. This captures real duration
    // even when beforeunload is blocked by ad-blockers, and naturally separates
    // human traffic (reaches 5s+) from bots (0-1s bounce).
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

    // Start heartbeats on initial load
    startHeartbeats();

    // Restart heartbeats on SPA navigation
    var origTrackPv = trackPageview;
    trackPageview = function () {
      origTrackPv();
      startHeartbeats();
    };

    // Create public API
    window.wa = window.wa || {};
    window.wa.track = function (name, props) {
      if (typeof name === "string" && name) sendEvent(name, props);
    };

    // Track initial pageview
    trackPageview();

    // ==========================================
    // MODULE: OPT-IN FEATURES
    // ==========================================
    var scrollDepthsMeasured = {};
    
    fetch(configEndpoint)
      .then(function(res) { return res.json(); })
      .then(function(config) {
        var f = config.features || {};

        // 1. Web Vitals
        if (f.web_vitals) {
          function observeVital(name, type, valFn) {
            try {
              var po = new PerformanceObserver(function (list) {
                var entries = list.getEntries();
                if (entries.length === 0) return;
                var last = entries[entries.length - 1];
                var val = valFn(last);
                if (val != null) {
                  sendEvent("web_vital", { metric: name, value: Math.round(val) });
                  po.disconnect();
                }
              });
              po.observe({ type: type, buffered: true });
            } catch (e) {}
          }
          observeVital("LCP", "largest-contentful-paint", function(e) { return e.startTime; });
          observeVital("FCP", "paint", function(e) { return e.name === "first-contentful-paint" ? e.startTime : null; });
          
          try {
            var clsVal = 0;
            var clsPo = new PerformanceObserver(function(list) {
              list.getEntries().forEach(function(e) { if (!e.hadRecentInput) clsVal += e.value; });
            });
            clsPo.observe({ type: "layout-shift", buffered: true });
            document.addEventListener("visibilitychange", function() {
              if (document.visibilityState === "hidden" && clsVal > 0) {
                sendEvent("web_vital", { metric: "CLS", value: Math.round(clsVal * 1000) });
                clsPo.disconnect();
              }
            });
          } catch(e) {}
          
          try {
            var interactions = [];
            var inpPo = new PerformanceObserver(function(list) {
              list.getEntries().forEach(function(e) { if (e.interactionId) interactions.push(e.duration); });
            });
            inpPo.observe({ type: "event", buffered: true, durationThreshold: 40 });
            document.addEventListener("visibilitychange", function() {
              if (document.visibilityState === "hidden" && interactions.length > 0) {
                interactions.sort(function(a,b) { return a - b; });
                var p98Index = Math.min(Math.ceil(interactions.length * 0.98) - 1, interactions.length - 1);
                var inp = interactions[p98Index];
                sendEvent("web_vital", { metric: "INP", value: Math.round(inp) });
                inpPo.disconnect();
              }
            });
          } catch(e) {}
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

  };

  function schedule() {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(run);
    } else {
      setTimeout(run, 150);
    }
  }

  // Defer until a prerendered page is actually activated, so speculation-rules
  // prerenders are not counted as visits. If the prerender is never activated,
  // nothing is ever sent — which is the correct outcome.
  if (document.prerendering) {
    document.addEventListener("prerenderingchange", schedule, { once: true });
  } else {
    schedule();
  }

})();
