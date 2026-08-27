/**
 * lib/validate.js — Shared License Validation Middleware
 * ──────────────────────────────────────────────────────
 * Every API endpoint MUST call validateLicense(req) before processing.
 * This prevents expired/invalid/inactive licenses from accessing ANY endpoint.
 *
 * Usage in endpoint:
 *   import { validateLicense } from "../lib/validate.js";
 *   const auth = await validateLicense(req);
 *   if (auth.error) return res.status(auth.status).json({ error: auth.error });
 *   // auth.license contains the valid license data
 */

import { db } from "./firebase.js";

/* ════════════════════════════════════════════════════════════════
 *  RATE LIMITER — In-memory per-IP rate limiting
 *  Prevents brute-force attacks on license validation
 * ════════════════════════════════════════════════════════════════ */
const rateLimit = new Map();
const RATE_WINDOW_MS = 60 * 1000;    /* 1 minute window */
const RATE_MAX_REQUESTS = 30;         /* max 30 requests per window */
const RATE_CLEANUP_INTERVAL = 5 * 60 * 1000; /* cleanup every 5 min */

/* Periodic cleanup to prevent memory leak in serverless */
let lastCleanup = Date.now();
function cleanupRateLimit() {
  const now = Date.now();
  if (now - lastCleanup < RATE_CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimit) {
    if (now - entry.start > RATE_WINDOW_MS) rateLimit.delete(key);
  }
}

function checkRateLimit(ip) {
  cleanupRateLimit();
  const now = Date.now();
  const entry = rateLimit.get(ip);
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateLimit.set(ip, { start: now, count: 1 });
    return { allowed: true, remaining: RATE_MAX_REQUESTS - 1 };
  }
  entry.count++;
  if (entry.count > RATE_MAX_REQUESTS) {
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - entry.start)) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }
  return { allowed: true, remaining: RATE_MAX_REQUESTS - entry.count };
}

function getClientIP(req) {
  return (req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "").split(",")[0].trim())
    || (req.socket && req.socket.remoteAddress)
    || "unknown";
}

const MAX_LICENSE_LENGTH = 128;

function normalize(value, maxLength) {
  if (typeof value !== "string") return "";
  const result = value.trim();
  return result.length > maxLength ? "" : result;
}

function isSafeLicenseKey(value) {
  return (
    value.length > 0 &&
    value.length <= MAX_LICENSE_LENGTH &&
    !/[.#$[\]/]/.test(value)
  );
}

function isExpired(expireAt) {
  if (!expireAt) return false;
  const expiry = new Date(`${expireAt}T23:59:59.999Z`);
  if (Number.isNaN(expiry.getTime())) return false;
  return Date.now() > expiry.getTime();
}

/**
 * Validate license key against Firebase.
 * Returns { license, licenseKey } on success, or { error, status } on failure.
 *
 * @param {object} req - Express request object (needs body or query)
 * @param {object} opts - Options: { requireFingerprint: false }
 */
export async function validateLicense(req, opts = {}) {
  /* ── Rate limit check ── */
  const ip = getClientIP(req);
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return { error: "RATE_LIMITED", status: 429, retryAfter: rl.retryAfter };
  }

  /* Extract licenseKey from body (POST) or query (GET) */
  const licenseKey = normalize(
    (req.body && req.body.licenseKey) || (req.query && req.query.licenseKey) || "",
    MAX_LICENSE_LENGTH
  );

  if (!licenseKey) {
    return { error: "LICENSE_KEY_REQUIRED", status: 400 };
  }

  if (!isSafeLicenseKey(licenseKey)) {
    return { error: "INVALID_LICENSE_KEY", status: 400 };
  }

  /* Check Firebase */
  const snap = await db.ref(`extension_access/${licenseKey}`).once("value");

  if (!snap.exists()) {
    return { error: "LICENSE_NOT_FOUND", status: 404 };
  }

  const license = snap.val() || {};

  /* Status check */
  if (license.status !== "active") {
    return { error: `LICENSE_${String(license.status || "INVALID").toUpperCase()}`, status: 403 };
  }

  /* Expiry check */
  if (isExpired(license.expire_at)) {
    return { error: "LICENSE_EXPIRED", status: 403, expire_at: license.expire_at || null };
  }

  /* Optional: fingerprint check */
  if (opts.requireFingerprint) {
    const fingerprint = normalize(
      (req.body && req.body.fingerprint) || "",
      4096
    );
    if (!fingerprint) {
      return { error: "FINGERPRINT_REQUIRED", status: 400 };
    }
    if (license.fingerprint && license.fingerprint !== fingerprint) {
      return { error: "LICENSE_ALREADY_USED_ON_ANOTHER_DEVICE", status: 403 };
    }
  }

  return { license, licenseKey };
}

export { normalize, isSafeLicenseKey, isExpired };
