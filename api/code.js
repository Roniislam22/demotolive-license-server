/**
 * POST /api/code/[moduleId]
 * ──────────────────────────────────────────────
 * Dynamic code delivery — serves encrypted business logic.
 *
 * The extension requests code modules by ID. This endpoint:
 *   1. Verifies the license key is valid
 *   2. Encrypts the requested module's source code
 *   3. Returns encrypted blob → extension decrypts in memory
 *
 * Customer NEVER sees the actual code in extension files.
 *
 * Input:  { licenseKey, moduleId, ts }
 * Output: { iv, data, ts }  (encrypted blob)
 */

import { db } from "../lib/firebase.js";

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function handleOPTIONS(req, res) {
  if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); }
  return false;
}

/* ── Shared derivation seed (must match security.js) ── */
const SEED = "dm2x$k9!mP@7vR#nQw3zLb5jFh8uCt1y";

import { webcrypto } from "node:crypto";
const crypto = webcrypto;

async function deriveKey(licenseKey) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(SEED + licenseKey),
    { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("dema-v2-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(data, licenseKey) {
  const key = await deriveKey(licenseKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, enc.encode(data)
  );
  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(ciphertext)),
    ts: Date.now()
  };
}

/* ═══════════════════════════════════════════════════════════════
 *  MODULE REGISTRY — Business logic stored on SERVER only
 * ═══════════════════════════════════════════════════════════════
 *
 * These code modules are the CORE business logic.
 * They exist ONLY on Vercel — never in extension files.
 * Customer can't modify what they can't see.
 */

const MODULES = {
  /* ── Rank calculation ── */
  rank: `
    const RANKS = [
      { min: 0, label: "Starter", icon: "low" },
      { min: 1000, label: "Bronze", icon: "low" },
      { min: 5000, label: "Silver", icon: "mid" },
      { min: 10000, label: "Gold", icon: "mid" },
      { min: 25000, label: "Platinum", icon: "high" },
      { min: 50000, label: "Diamond", icon: "high" },
    ];
    function calcRank(balance) {
      let rank = RANKS[0];
      for (const r of RANKS) if (balance >= r.min) rank = r;
      return rank;
    }
    function calculate(balance, startingBalance) {
      const b = Math.max(0, Number(balance) || 0);
      const sb = Math.max(1, Number(startingBalance) || 1);
      const rankWidth = Math.min(100, Math.round((b / sb) * 100));
      const rank = calcRank(b);
      return { rankWidth, rankLabel: rank.label, icon: rank.icon };
    }
    exports.calculate = calculate;
  `,

  /* ── Trade analytics ── */
  trades: `
    function processTrades(trades, settings) {
      const startingBalance = Number(settings.startingBalance) || 0;
      let totalProfit = 0, wins = 0, losses = 0, maxWin = 0, maxLoss = 0;
      for (const t of trades) {
        const pnl = Number(t.profit ?? t.pnl ?? 0);
        totalProfit += pnl;
        if (pnl > 0) { wins++; maxWin = Math.max(maxWin, pnl); }
        else { losses++; maxLoss = Math.min(maxLoss, pnl); }
      }
      const total = trades.length;
      const winRate = total > 0 ? +((wins / total) * 100).toFixed(1) : 0;
      const currentBalance = startingBalance + totalProfit;
      return {
        analytics: {
          totalProfit: +totalProfit.toFixed(2),
          totalTrades: total, wins, losses, winRate,
          maxWin: +maxWin.toFixed(2), maxLoss: +maxLoss.toFixed(2),
          currentBalance: +currentBalance.toFixed(2)
        }
      };
    }
    exports.processTrades = processTrades;
  `,

  /* ── License validation helpers ── */
  license: `
    const MAX_LICENSE_LENGTH = 128;
    const MAX_FINGERPRINT_LENGTH = 4096;
    function normalize(value, maxLength) {
      if (typeof value !== "string") return "";
      const result = value.trim();
      return result.length > maxLength ? "" : result;
    }
    function isSafeLicenseKey(value) {
      return value.length > 0 && value.length <= MAX_LICENSE_LENGTH && !/[.#$[\\]/]/.test(value);
    }
    function isExpired(expireAt) {
      if (!expireAt) return false;
      const expiry = new Date(expireAt + "T23:59:59.999Z");
      if (isNaN(expiry.getTime())) return false;
      return Date.now() > expiry.getTime();
    }
    exports.normalize = normalize;
    exports.isSafeLicenseKey = isSafeLicenseKey;
    exports.isExpired = isExpired;
  `,
};

/* ── Validate license key against Firebase ── */
async function validateLicense(licenseKey) {
  if (!licenseKey || typeof licenseKey !== "string") return false;
  const snap = await db.ref(`extension_access/${licenseKey}`).once("value");
  if (!snap.exists()) return false;
  const license = snap.val();
  return license.status === "active";
}

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { licenseKey, moduleId } = req.body;

    if (!licenseKey || !moduleId)
      return res.status(400).json({ error: "licenseKey and moduleId required" });

    /* ── Verify license is valid ── */
    const valid = await validateLicense(licenseKey);
    if (!valid)
      return res.status(403).json({ error: "INVALID_LICENSE" });

    /* ── Check module exists ── */
    const code = MODULES[moduleId];
    if (!code)
      return res.status(404).json({ error: "MODULE_NOT_FOUND" });

    /* ── Encrypt and return ── */
    const encrypted = await encrypt(code.trim(), licenseKey);
    return res.status(200).json(encrypted);

  } catch (err) {
    console.error("code delivery error:", err);
    return res.status(500).json({ error: "CODE_DELIVERY_FAILED" });
  }
}
