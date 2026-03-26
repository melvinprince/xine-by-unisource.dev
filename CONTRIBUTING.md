# Contributing to Xine

Thank you for your interest in contributing! This guide will help you get started.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [PostgreSQL](https://www.postgresql.org/) 16+
- npm (comes with Node.js)

### Getting Started

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/xine.git
   cd xine
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up your environment**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your local PostgreSQL credentials.

4. **Set up the database**

   ```bash
   npx drizzle-kit push
   ```

5. **Start the development server**

   ```bash
   npm run dev
   ```

   The dashboard will be available at `http://localhost:3000`.

## How to Contribute

### Reporting Bugs

- Use the [Bug Report](https://github.com/melvinprince/xine-by-unisource.dev/issues/new?template=bug_report.md) issue template
- Include steps to reproduce, expected vs actual behavior, and your environment details

### Suggesting Features

- Use the [Feature Request](https://github.com/melvinprince/xine-by-unisource.dev/issues/new?template=feature_request.md) issue template
- Explain the use case and why it would be valuable

### Submitting Code

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following our code style:
   - Use TypeScript for all new code
   - Follow existing patterns in the codebase
   - Add comments for complex logic

3. **Test your changes**:
   ```bash
   npm run build
   npm run lint
   ```

4. **Commit with a descriptive message**:
   ```bash
   git commit -m "feat: add support for custom event properties"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` — New feature
   - `fix:` — Bug fix
   - `docs:` — Documentation changes
   - `refactor:` — Code refactoring
   - `perf:` — Performance improvement
   - `chore:` — Maintenance tasks

5. **Push and open a Pull Request**

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Update documentation if needed
- Ensure the build passes
- Describe what your PR does and why

## Project Structure

```
xine/
├── src/
│   ├── app/              # Next.js app router pages & API routes
│   │   ├── api/          # Backend API (collect, auth, config, etc.)
│   │   ├── dashboard/    # Dashboard pages (analytics, events, goals, etc.)
│   │   ├── login/        # Authentication page
│   │   └── share/        # Public shared dashboards
│   ├── components/       # React components (charts, sidebar, etc.)
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Core libraries
│   │   ├── db/           # Database schema, relations, connection
│   │   ├── queries.ts    # Database queries
│   │   └── types.ts      # TypeScript types
│   ├── tracking.js       # Source tracking script (compiled to public/t.js)
│   └── proxy.ts          # Proxy utilities
├── drizzle/              # Database migrations
├── public/               # Static assets (compiled t.js)
└── .github/workflows/    # CI/CD pipelines
```

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Questions?

Feel free to open a [Discussion](https://github.com/melvinprince/xine/discussions) or reach out via issues.

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0 License](LICENSE).
