/**
 * POST /api/trades/process
 * ──────────────────────────────────────────────
 * Pure business logic: process / compute trade analytics.
 *
 * Input:  { trades: [...], settings: { startingBalance, ... } }
 * Output: { analytics: { totalProfit, winRate, ... }, displayData }
 */
function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

export default function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { trades = [], settings = {} } = req.body;
    const startingBalance = Number(settings.startingBalance) || 0;

    /* ── aggregate analytics ── */
    let totalProfit  = 0;
    let totalTrades  = trades.length;
    let wins         = 0;
    let losses       = 0;
    let maxWin       = 0;
    let maxLoss      = 0;

    for (const t of trades) {
      const pnl = Number(t.profit ?? t.pnl ?? 0);
      totalProfit += pnl;
      if (pnl > 0) { wins++;   maxWin  = Math.max(maxWin,  pnl); }
      else         { losses++; maxLoss = Math.min(maxLoss, pnl); }
    }

    const winRate     = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : "0.0";
    const currentBal  = startingBalance + totalProfit;

    return res.status(200).json({
      analytics: {
        totalProfit:  +totalProfit.toFixed(2),
        totalTrades,
        wins,
        losses,
        winRate:      +winRate,
        maxWin:       +maxWin.toFixed(2),
        maxLoss:      +maxLoss.toFixed(2),
        currentBalance: +currentBal.toFixed(2),
      },
    });
  } catch (err) {
    console.error("trades/process error:", err);
    return res.status(500).json({ error: "Processing failed" });
  }
};
