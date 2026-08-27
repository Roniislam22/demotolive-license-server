/**
 * GET /api/get?licenseKey=xxx
 * ──────────────────────────────────────────────
 * Retrieve user settings from Firebase.
 * REQUIRES valid, active, non-expired license.
 */
import { db } from "../lib/firebase.js";
import { validateLicense } from "../lib/validate.js";

function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    /* ── LICENSE VALIDATION ── */
    const auth = await validateLicense(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error, success: false });
    const { licenseKey } = auth;

    const snap = await db
      .ref(`user_settings/${licenseKey}`)
      .once("value");

    return res.status(200).json({
      success:  true,
      settings: snap.val() || {},
    });
  } catch (err) {
    console.error("get error:", err);
    return res.status(500).json({ success: false });
  }
}
