# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Xine, please report it responsibly.

**DO NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@unisource.dev**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment**: Within 48 hours
- **Initial Assessment**: Within 1 week
- **Fix & Disclosure**: Coordinated with reporter

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Security Best Practices for Self-Hosting

1. **Never expose your database directly** — Always use a firewall and restrict access to trusted IPs
2. **Use strong passwords** — For both the database and dashboard access
3. **Keep dependencies updated** — Run `npm audit` regularly
4. **Use HTTPS** — Always serve the dashboard and tracking script over TLS
5. **Rotate API keys** — Periodically regenerate site API keys through the dashboard
