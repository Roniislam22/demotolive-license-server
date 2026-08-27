/**
 * POST /api/restore
 * ──────────────────────────────────────────────
 * Restore soft-deleted trades.
 * REQUIRES valid, active, non-expired license.
 */
import { db } from "../lib/firebase.js";
import { validateLicense } from "../lib/validate.js";

function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    /* ── LICENSE VALIDATION ── */
    const auth = await validateLicense(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error, success: false });
    const { licenseKey } = auth;
    const tradeIds = (req.body && req.body.tradeIds) || [];

    if (!tradeIds.length)
      return res.status(400).json({ error: "tradeIds required" });

    const updates = {};
    for (const id of tradeIds) {
      updates[`deleted_trades/${licenseKey}/${id}`] = null;
    }
    await db.ref().update(updates);

    return res.status(200).json({ success: true, restoredCount: tradeIds.length });
  } catch (err) {
    console.error("restore error:", err);
    return res.status(500).json({ success: false });
  }
}
