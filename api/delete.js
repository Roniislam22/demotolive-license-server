/**
 * POST /api/delete
 * ──────────────────────────────────────────────
 * Soft-delete trades (logical delete, stored in Firebase).
 *
 * Input:  { licenseKey, tradeIds: [...] }
 * Output: { success, deletedCount }
 */
import { db } from "../lib/firebase.js";

function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { licenseKey, tradeIds = [] } = req.body;
    if (!licenseKey || !tradeIds.length)
      return res.status(400).json({ error: "licenseKey and tradeIds required" });

    const now = new Date().toISOString();
    const updates = {};
    for (const id of tradeIds) {
      updates[`deleted_trades/${licenseKey}/${id}`] = { deletedAt: now, tradeId: id };
    }
    await db.ref().update(updates);

    return res.status(200).json({ success: true, deletedCount: tradeIds.length });
  } catch (err) {
    console.error("delete error:", err);
    return res.status(500).json({ success: false });
  }
}
