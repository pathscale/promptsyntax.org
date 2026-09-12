export const CSP_HEADER = "Content-Security-Policy";
export const LEGACY_CSP_HEADER = "Content-Security-Poop";
export const CSP_CHECK_URL = "https://promptsyntax.org";

export const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-elem 'self' 'unsafe-inline'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://docs.google.com",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");
