/**
 * POST /api/calculate
 * ──────────────────────────────────────────────
 * Pure business logic: compute rank width % from balance.
 *
 * Input:  { balance, startingBalance }
 * Output: { rankWidth, rankLabel, icon }
 */
function setCORS(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); }
function handleOPTIONS(req, res) { if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); } return false; }

/* ── rank thresholds (same as extension logic) ── */
const RANKS = [
  { min: 0,      label: "Starter",  icon: "low"  },
  { min: 1000,   label: "Bronze",   icon: "low"  },
  { min: 5000,   label: "Silver",   icon: "mid"  },
  { min: 10000,  label: "Gold",     icon: "mid"  },
  { min: 25000,  label: "Platinum", icon: "high" },
  { min: 50000,  label: "Diamond",  icon: "high" },
];

function calcRank(balance) {
  let rank = RANKS[0];
  for (const r of RANKS) if (balance >= r.min) rank = r;
  return rank;
}

export default function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { balance = 0, startingBalance = 0 } = req.body;
    const b  = Math.max(0, Number(balance)  || 0);
    const sb = Math.max(1, Number(startingBalance) || 1);

    const rankWidth = Math.min(100, Math.round((b / sb) * 100));
    const rank      = calcRank(b);

    return res.status(200).json({
      rankWidth,
      rankLabel: rank.label,
      icon:      rank.icon,
    });
  } catch (err) {
    console.error("rank error:", err);
    return res.status(500).json({ error: "Calculation failed" });
  }
}
