# Xine by Unisource

Privacy-first, cookie-free web analytics — a lightweight alternative to Google Analytics. Self-host on your own VPS, or deploy for free with Vercel + Supabase. Own your data.

[Report Bug](https://github.com/melvinprince/xine-by-unisource.dev/issues/new?template=bug_report.md) · [Request Feature](https://github.com/melvinprince/xine-by-unisource.dev/issues/new?template=feature_request.md)

---

## Why Xine?

Most analytics tools are either **privacy-invasive** (Google Analytics), **expensive** (Mixpanel, Amplitude), or **limited** (simple counters). Xine gives you:

- 🔒 **Complete privacy** — No cookies, no fingerprinting, no personal data collection
- 🏠 **Self-hosted or cloud** — Run on your own VPS, Docker, or deploy free with Vercel + Supabase
- 🪶 **Lightweight** — ~5KB tracking script that won't slow your site
- 📊 **Full-featured** — Dashboards, funnels, goals, Web Vitals, session replay, and more
- 🆓 **Free & open source** — AGPL-3.0 licensed, forever

## Features

### Core Analytics
- **Visitor & pageview tracking** with session management
- **Real-time dashboard** with live visitor count
- **Multi-site support** — track unlimited websites from one instance
- **SPA support** — automatic tracking for React, Next.js, Vue, etc.
- **UTM campaign tracking** — source, medium, campaign parameters
- **Geo-location** — country, city, continent
- **Device intelligence** — browser, OS, device type, screen resolution
- **Bot detection** and filtering

### Advanced Modules (Opt-in)
Toggle features per-site to keep the tracking script minimal:

| Module | Description |
|--------|-------------|
| **Web Vitals** | LCP, FCP, CLS, INP — Core Web Vitals monitoring |
| **Scroll Depth** | Track how far visitors scroll (25%, 50%, 75%, 100%) |
| **Outbound Clicks** | Monitor external link clicks |
| **JS Error Tracking** | Catch JavaScript errors and unhandled promise rejections |
| **Click Tracking** | Heatmap-style click position tracking |
| **Rage Click Detection** | Detect frustrated rapid clicking |
| **File Downloads** | Track PDF, ZIP, DOC, and other file downloads |
| **Form Abandonment** | Know when users start but don't submit forms |
| **Session Replay** | Lightweight session recording (mouse, clicks, scrolls) |

### Dashboard Features
- 📈 **Analytics overview** — visitors, pageviews, bounce rate, avg. duration
- 🎯 **Goal tracking** — set conversion goals with flexible conditions
- 🔄 **Funnel visualization** — multi-step conversion funnels
- 🌐 **SEO insights** — referrers, search terms, landing pages
- ⚡ **Performance monitoring** — Web Vitals gauges and trends
- 📝 **Annotations** — mark deployments, campaigns, or events on charts
- 🔔 **Alerts** — traffic spikes, drops, error increases (email/webhook)
- 📧 **Email reports** — daily, weekly, or monthly summaries
- 🟢 **Uptime monitoring** — track site availability
- 🔗 **Public dashboards** — shareable read-only views
- 🌓 **Themes** — premium light and dark UI modes with smooth animations

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | [Next.js](https://nextjs.org/) 16 (App Router, Standalone output) |
| **Language** | TypeScript |
| **Database** | PostgreSQL 16+ (self-hosted, Supabase, Neon, Railway) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **Charts** | [Recharts](https://recharts.org/) |
| **Animations** | [GSAP](https://gsap.com/) |
| **Icons** | [Lucide React](https://lucide.dev/) |
| **Styling** | Tailwind CSS 4 |
| **Deployment** | Docker, VPS (PM2), or Vercel |

## Quick Start

### Self-Hosting with Docker (Recommended)

The easiest way to get started is using Docker Compose. This spins up both the Xine app and a PostgreSQL database automatically.

1. **Clone the repository**
   ```bash
   git clone https://github.com/melvinprince/xine-by-unisource.dev.git
   cd xine
   ```

2. **Start the containers**
   ```bash
   docker-compose up -d
   ```

3. **Access the dashboard**
   Visit `http://localhost:3000` and log in with the password you configured.

> **⚠️ Important:** Before running `docker-compose up -d`, edit the environment variables in `docker-compose.yml` to set secure passwords for `DB_PASSWORD` and `DASHBOARD_PASSWORD`. The defaults are placeholder values and must be changed for any deployment.

---

### Easy Deploy (Vercel + Supabase)

The fastest way to deploy for free without managing a server.

1. **Create Database:** Go to [Supabase](https://supabase.com), create a free project, and copy your Database Connection String (`Transaction` mode).
2. **Deploy App:** Click the button below to deploy to Vercel.

   [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmelvinprince%2Fxine)

3. **Configure Environment:** Set these variables in Vercel during deployment:
   - `DATABASE_URL`: Your Supabase connection string (e.g., `postgresql://...`)
   - `DASHBOARD_PASSWORD`: A secure password to access your dashboard
   - `STANDALONE_OUTPUT`: Set to `false`

4. **Initialize Database:** Once deployed, run migrations locally against your Supabase DB:
   ```bash
   git clone https://github.com/melvinprince/xine-by-unisource.dev.git
   cd xine
   npm install
   # Set DATABASE_URL in .env.local, then run:
   npx drizzle-kit push
   ```

---

### Manual Setup (For Development/VPS)

#### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [PostgreSQL](https://www.postgresql.org/) 16+
- A Linux VPS (recommended) or any server that can run Node.js

### 1. Clone the repository

```bash
git clone https://github.com/melvinprince/xine-by-unisource.dev.git
cd xine
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your database credentials:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_secure_password
DB_NAME=analytics_db
DASHBOARD_PASSWORD=your_dashboard_password
```

### 4. Set up the database

```bash
npx drizzle-kit push
```

### 5. Start the development server

```bash
npm run dev
```

Visit `http://localhost:3000` to access the dashboard.

### 6. Add tracking to your website

After creating a site in the dashboard, add the tracking script to your website:

```html
<script
  defer
  src="https://YOUR_ANALYTICS_DOMAIN/t.js"
  data-api-key="YOUR_SITE_API_KEY"
></script>
```

That's it! Pageviews, sessions, and enabled features will start tracking automatically.

### Custom Event Tracking

Track custom events from your website using the JavaScript API:

```javascript
// Track a button click
wa.track("signup_click", { plan: "pro" });

// Track a purchase
wa.track("purchase", { value: 29.99, currency: "USD" });
```

## Production Deployment

### Build for production

```bash
npm run build
```

This creates a standalone output in `.next/standalone/`.

### Deploy to your server

1. Copy the deploy script template:
   ```bash
   cp deploy.example.ps1 deploy.ps1
   ```

2. Update `deploy.ps1` with your server details (IP, username, paths)

3. Run the deployment:
   ```powershell
   .\deploy.ps1
   ```

The deploy script handles building, staging, compressing, transferring via SCP, extracting on the server, and restarting PM2.

### GitHub Actions CI/CD

The project includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) for automated deployments on push to `main`. Configure these repository secrets:

- `SSH_PRIVATE_KEY` — Your server SSH private key
- `SERVER_IP` — Your server IP address
- `USERNAME` — SSH username

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| **Option A: Self-hosted DB** | | |
| `DB_HOST` | Yes* | PostgreSQL host |
| `DB_PORT` | Yes* | PostgreSQL port (default: 5432) |
| `DB_USER` | Yes* | PostgreSQL username |
| `DB_PASSWORD` | Yes* | PostgreSQL password |
| `DB_NAME` | Yes* | PostgreSQL database name |
| **Option B: Cloud DB** | | |
| `DATABASE_URL` | Yes* | PostgreSQL connection string (Supabase/Neon) |
| `STANDALONE_OUTPUT`| No | Set to `false` when deploying to Vercel |
| **App Configuration**| | |
| `DASHBOARD_PASSWORD` | Yes | Password to access the dashboard |
| `CF_API_TOKEN` | No | Cloudflare API token (for cache purging) |
| `CF_ZONE_ID` | No | Cloudflare zone ID |

> **\*** Use **either** Option A (individual DB vars for self-hosted/Docker) **or** Option B (`DATABASE_URL` for cloud providers). You don't need both.

## Project Structure

```
xine/
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── api/              # API routes
│   │   │   ├── auth/         # Authentication
│   │   │   ├── collect/      # Data ingestion endpoint
│   │   │   ├── config/       # Per-site feature config
│   │   │   ├── cron/         # Scheduled tasks
│   │   │   ├── dashboard/    # Dashboard data API
│   │   │   ├── sites/        # Site management API
│   │   │   └── v1/           # Public API v1
│   │   ├── dashboard/        # Dashboard pages
│   │   ├── login/            # Auth page
│   │   └── share/            # Public shared views
│   ├── components/           # React components
│   │   └── charts/           # Chart components
│   ├── hooks/                # Custom React hooks
│   ├── lib/                  # Core libraries
│   │   ├── db/               # Schema, relations, connection
│   │   ├── queries.ts        # Database queries
│   │   └── types.ts          # TypeScript types
│   └── tracking.js           # Tracking script source
├── drizzle/                  # Database migrations
├── public/
│   └── t.js                  # Compiled tracking script
├── .github/
│   ├── workflows/            # CI/CD pipelines
│   └── ISSUE_TEMPLATE/       # Issue templates
├── docker-compose.yml        # Docker Compose config
├── Dockerfile                # Multi-stage Docker build
├── .env.example              # Environment template
├── deploy.example.ps1        # Deploy script template
├── drizzle.config.ts         # Drizzle ORM config
└── next.config.ts            # Next.js config
```

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## Security

To report a vulnerability, please see [SECURITY.md](SECURITY.md). **Do not open public issues for security vulnerabilities.**

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

This means you can freely use, modify, and self-host this software. If you modify and deploy it as a network service, you must make your modifications available under the same license.

## Acknowledgments

Built with these amazing open-source projects:

- [Next.js](https://nextjs.org/) — React framework
- [Drizzle ORM](https://orm.drizzle.team/) — TypeScript ORM
- [Recharts](https://recharts.org/) — Charting library
- [GSAP](https://gsap.com/) — Animation library
- [Lucide](https://lucide.dev/) — Icon library

---

Made with ❤️ by [Melvin Prince](https://github.com/melvinprince)
