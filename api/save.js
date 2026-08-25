/**
 * POST /api/settings/save
 * ──────────────────────────────────────────────
 * Save user settings to Firebase.
 *
 * Input:  { licenseKey, settings: { startingBalance, rankBarWidth, customName, ... } }
 * Output: { success }
 */
import { db } from "../../lib/firebase.js";

function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { licenseKey, settings = {} } = req.body;
    if (!licenseKey)
      return res.status(400).json({ error: "licenseKey required" });

    await db.ref(`user_settings/${licenseKey}`).set({
      ...settings,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("settings/save error:", err);
    return res.status(500).json({ success: false });
  }
};
