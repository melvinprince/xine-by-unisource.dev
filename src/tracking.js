(function () {
  "use strict";

  // Prevent tracking bots, data-saver mode, and prerendering
  if (
    navigator.webdriver ||
    (navigator.connection && navigator.connection.saveData) ||
    document.visibilityState === "prerender"
  ) {
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
      vid = localStorage.getItem("_wa_vid");
      if (!vid) {
        vid = crypto.randomUUID();
        localStorage.setItem("_wa_vid", vid);
      }
      sid = sessionStorage.getItem("_wa_sid");
      if (!sid) {
        sid = crypto.randomUUID();
        sessionStorage.setItem("_wa_sid", sid);
      }
    } catch (e) {
      vid = crypto.randomUUID();
      sid = crypto.randomUUID();
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

    var isBlocked = false;

    function sendPayload(payload) {
      if (isBlocked) return;
      var dataStr = JSON.stringify(payload);
      try {
        if (navigator.sendBeacon) {
          var sent = navigator.sendBeacon(endpoint, new Blob([dataStr], { type: "application/json" }));
          if (!sent) isBlocked = true;
        } else {
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: dataStr,
            keepalive: true
          }).catch(function () { isBlocked = true; });
        }
      } catch (e) {
        isBlocked = true;
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

    function trackPageview() {
      var newUrl = location.pathname + location.search;
      if (newUrl === currentUrl) return;

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
            var inpVal = 0;
            var inpPo = new PerformanceObserver(function(list) {
              list.getEntries().forEach(function(e) { if (e.duration > inpVal) inpVal = e.duration; });
            });
            inpPo.observe({ type: "event", buffered: true });
            document.addEventListener("visibilitychange", function() {
              if (document.visibilityState === "hidden" && inpVal > 0) {
                sendEvent("web_vital", { metric: "INP", value: Math.round(inpVal) });
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

        // 9. Session Replay (Lite)
        if (f.session_replay) {
          var replayEvents = [];
          
          try {
            var html = document.documentElement.outerHTML;
            replayEvents.push({ type: 'snapshot', html: html, width: window.innerWidth, height: window.innerHeight, time: Date.now() });
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

      })
      .catch(function() { isBlocked = true; }); // If config blocked, stop all tracking

  };

  if (window.requestIdleCallback) {
    window.requestIdleCallback(run);
  } else {
    setTimeout(run, 150);
  }

})();
