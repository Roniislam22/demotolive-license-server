/**
 * GET /api/settings/get?licenseKey=xxx
 * ──────────────────────────────────────────────
 * Retrieve user settings from Firebase.
 *
 * Output: { success, settings: { startingBalance, rankBarWidth, customName, ... } }
 */
import { db } from "../../lib/firebase.js";

function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { licenseKey } = req.query;
    if (!licenseKey)
      return res.status(400).json({ error: "licenseKey required" });

    const snap = await db
      .ref(`user_settings/${licenseKey}`)
      .once("value");

    return res.status(200).json({
      success:  true,
      settings: snap.val() || {},
    });
  } catch (err) {
    console.error("settings/get error:", err);
    return res.status(500).json({ success: false });
  }
};
