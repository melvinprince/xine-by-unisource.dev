# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-21

### Added

- Privacy-first tracking script (`t.js`) — lightweight, cookie-free, ~5KB
- Real-time analytics dashboard with visitor, pageview, and session metrics
- Multi-site support with per-site API keys
- Session tracking with bounce rate, entry/exit pages, and duration
- UTM campaign parameter tracking
- Opt-in feature modules:
  - Web Vitals (LCP, FCP, CLS, INP)
  - Scroll depth tracking
  - Outbound click tracking
  - JavaScript error monitoring
  - Click heatmap tracking
  - Rage click detection
  - File download tracking
  - Form abandonment tracking
  - Session replay (lite)
- Goal tracking with conversion funnels
- Funnel visualization
- Annotations system for marking events on charts
- Uptime monitoring
- Alert & notification system (email, webhook)
- Email reports (daily, weekly, monthly)
- SEO analytics
- Public/shareable dashboard views
- SPA support (pushState, replaceState, popstate)
- Bot detection and filtering
- Dark mode dashboard UI with GSAP animations
- Self-hosted on PostgreSQL with Drizzle ORM
- GitHub Actions CI/CD deployment pipeline
