import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Notes:
 * - `script-src` includes `'unsafe-inline'` because (a) Next.js injects a small
 *   inline bootstrap script and (b) the anti-FOUC theme script in the root
 *   layout runs before hydration. Upgrading to a nonce-based policy would
 *   require threading a per-request nonce through middleware; tracked as a
 *   follow-up in REVIEW_AND_IMPROVEMENTS.md.
 * - `connect-src` allows the Supabase REST/Realtime endpoints (https + wss).
 * - `img-src` allows https + data: so org branding logo URLs and inline SVGs
 *   render.
 */
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  // Never advertise the framework/version in responses.
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
