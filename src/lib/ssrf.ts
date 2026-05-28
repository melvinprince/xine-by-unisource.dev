// Centralized SSRF Protection Helpers
// Blocks private/internal IP ranges, reserved hostnames, and invalid protocols.

const BLOCKED_HOSTNAMES = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
  "metadata.google.internal",
];

export function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const hostname = url.hostname.toLowerCase();

    // Block known dangerous hostnames
    if (BLOCKED_HOSTNAMES.includes(hostname)) return true;

    // Block cloud metadata endpoints
    if (hostname === "169.254.169.254") return true;
    if (hostname.endsWith(".internal")) return true;

    // Block private IP ranges (10.x, 172.16-31.x, 192.168.x)
    const parts = hostname.split(".").map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      if (parts[0] === 10) return true;
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
      if (parts[0] === 192 && parts[1] === 168) return true;
      if (parts[0] === 169 && parts[1] === 254) return true;
      if (parts[0] === 0) return true;
    }

    // Block non-HTTP(S) protocols
    if (url.protocol !== "https:" && url.protocol !== "http:") return true;

    return false;
  } catch {
    return true; // If URL parsing fails, fail-closed and block it
  }
}
