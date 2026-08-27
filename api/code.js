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

function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function handleOPTIONS(req, res) {
  if (req.method === "OPTIONS") { setCORS(res); return res.status(204).end(); }
  return false;
}

/* Shared derivation seed (must match security.js) */
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

/* ==============================================================
 *  MODULE REGISTRY — Business logic stored on SERVER only
 * ============================================================== */

const MODULES = {

  /* -- Rank calculation -- */
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

  /* -- Trade analytics -- */
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

  /* -- License validation helpers -- */
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

  /* ==========================================================
   *  SWAP — Demo-to-Live account visual swap
   *  Server-only logic — customer cannot copy
   * ========================================================== */
  swap: `
    function formatUSD(n) {
      return new Intl.NumberFormat("en-US", {
        style: "currency", currency: "USD",
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }).format(Number(n) || 0);
    }
    function getVipLevel(bal) {
      if (bal >= 10000) return { lbl: "vip level:", nm: "VIP", cls: "icon-profile-level-vip" };
      if (bal >= 5000)  return { lbl: "pro level:", nm: "Pro", cls: "icon-profile-level-pro" };
      return { lbl: "standard:", nm: "Standard", cls: "icon-profile-level-standart" };
    }
    function applyVip(el, bal) {
      if (!el) return;
      var v = getVipLevel(bal);
      var sp = "https://" + location.hostname + "/profile/images/spritemap.svg#";
      var lbl = el.querySelector(".usermenu__level-name:not(.hidden)");
      var pft = el.querySelector(".usermenu__level-profit:not(.hidden)");
      var svg = el.querySelector("svg.icon-profile-level-standart,svg.icon-profile-level-pro,svg.icon-profile-level-vip");
      var use = svg && svg.querySelector("use");
      if (lbl) lbl.textContent = v.lbl;
      if (pft) pft.textContent = v.nm;
      if (svg) svg.setAttribute("class", v.cls);
      if (use) use.setAttribute("xlink:href", sp + v.cls);
    }
    function swapMenu(root) {
      var items = root.querySelectorAll("li.usermenu__select-item--radio,li.RDtBn");
      var demo = null, live = null, demoBal = 0;
      items.forEach(function(li) {
        var t = ((li.querySelector("a.yBslY,a.usermenu__select-name") || {}).textContent || "").trim();
        if (t.indexOf("Demo") >= 0) demo = li;
        if (t.indexOf("Live") >= 0) live = li;
      });
      items.forEach(function(li) { li.classList.remove("active"); li.classList.remove("Qx5RW"); });
      if (live) live.classList.add("active");
      if (demo) {
        var inp = demo.querySelector("input.input-control__input");
        var bal = demo.querySelector("b.YnoT0,b.usermenu__select-balance");
        if (inp && !isNaN(parseFloat(inp.value))) demoBal = parseFloat(inp.value);
        else if (bal) { var cv = bal.textContent.replace(/[$,]/g, ""); if (!isNaN(parseFloat(cv))) demoBal = parseFloat(cv); }
        if (bal) bal.textContent = formatUSD(10000);
      }
      if (live) { var lb = live.querySelector("b.YnoT0,b.usermenu__select-balance"); if (lb) lb.textContent = formatUSD(demoBal); }
      applyVip(demo, demoBal);
      return demoBal;
    }
    function swapSidebar(root) {
      var items = root.querySelectorAll("li.usermenu__select-item--radio");
      var demo = null, live = null, demoBal = 0;
      items.forEach(function(li) {
        var t = ((li.querySelector("a.usermenu__select-name") || {}).textContent || "").trim();
        if (t.indexOf("Demo") >= 0) demo = li;
        if (t.indexOf("Live") >= 0) live = li;
      });
      items.forEach(function(li) { li.classList.remove("active"); });
      if (live) live.classList.add("active");
      if (demo) {
        var b = demo.querySelector(".usermenu__select-balance");
        if (b) { var cv = b.textContent.replace(/[$,]/g, "").trim(); if (!isNaN(parseFloat(cv))) demoBal = parseFloat(cv); b.textContent = formatUSD(10000); }
      }
      if (live) { var lb = live.querySelector(".usermenu__select-balance"); if (lb) lb.textContent = formatUSD(demoBal); }
      applyVip(root.querySelector(".usermenu__level"), demoBal);
      return demoBal;
    }
    function executeSwap(doc) {
      var dropdown = doc.querySelector("ul.usermenu__select,ul.IkdIG");
      var sidebar = doc.querySelector(".usermenu");
      var bal = 0;
      if (dropdown) bal = swapMenu(dropdown);
      if (sidebar) bal = swapSidebar(sidebar);
      var inp = doc.querySelector("input.input-control__input");
      if (inp && !isNaN(parseFloat(inp.value))) { inp.dataset._origBal = inp.value; inp.value = "10000"; }
      return bal;
    }
    function restoreSwap(doc) {
      var inp = doc.querySelector("input.input-control__input");
      if (inp && inp.dataset._origBal) { inp.value = inp.dataset._origBal; delete inp.dataset._origBal; }
    }
    exports.executeSwap = executeSwap;
    exports.restoreSwap = restoreSwap;
    exports.formatUSD = formatUSD;
    exports.getVipLevel = getVipLevel;
  `,

  /* ==========================================================
   *  WATERMARK — Demo watermark / overlay removal
   *  Server-only logic — customer cannot copy
   * ========================================================== */
  watermark: `
    var WM_SELECTORS = [".blocking-overlay",".demo-overlay","[class*='demo']","[class*='watermark']","[class*='DEMO']","[data-demo]"];
    var WM_REGEX = /(?:^|\\s)(?:demo(?:\\s+(?:account|trading))?|practice)(?:\\s|$)/i;
    var wm_hidden = new WeakSet();
    function wm_hide(el) {
      if (wm_hidden.has(el)) return;
      el.style.setProperty("display", "none", "important");
      el.style.setProperty("visibility", "hidden", "important");
      el.style.setProperty("opacity", "0", "important");
      el.style.setProperty("pointer-events", "none", "important");
      el.setAttribute("aria-hidden", "true");
      wm_hidden.add(el);
    }
    function wm_scan(root) {
      WM_SELECTORS.forEach(function(sel) {
        try { root.querySelectorAll(sel).forEach(wm_hide); } catch(e) {}
      });
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
      var node;
      while (node = walker.nextNode()) {
        if (WM_REGEX.test(node.textContent)) {
          var parent = node.parentElement;
          if (parent && !wm_hidden.has(parent)) {
            var tag = (parent.tagName || "").toLowerCase();
            if (tag && ["input","textarea","select","script","style"].indexOf(tag) < 0) {
              wm_hide(parent);
            }
          }
        }
      }
    }
    function startWatermarkRemoval(doc) {
      wm_scan(doc.body || doc);
      var obs = new MutationObserver(function(muts) {
        for (var i = 0; i < muts.length; i++) {
          var nodes = muts[i].addedNodes;
          for (var j = 0; j < nodes.length; j++) {
            if (nodes[j].nodeType === 1) wm_scan(nodes[j]);
          }
        }
      });
      obs.observe(doc.body || doc, { childList: true, subtree: true });
      return obs;
    }
    exports.startWatermarkRemoval = startWatermarkRemoval;
    exports.scan = wm_scan;
    exports.hide = wm_hide;
  `,

  /* ==========================================================
   *  EDITOR — Transaction history editor
   *  Server-only logic — customer cannot copy
   * ========================================================== */
  editor: `
    var ED_STORAGE_KEY = "qxbroker_edited_transactions";
    function ed_css() {
      return ".modal-overlay.active{display:flex!important}" +
        ".tx-ed-bg{background:rgba(0,0,0,.8);position:fixed;top:0;left:0;width:100vw;height:100vh;overflow:hidden;z-index:10000;display:none;backdrop-filter:blur(5px)}" +
        ".tx-ed-box{background:#0f0f23;border:1px solid #374151;border-radius:20px;padding:0;box-shadow:0 20px 60px rgba(0,0,0,.5);width:90%;max-width:480px;max-height:90vh;overflow:hidden;position:relative;animation:txSlideIn .3s ease-out}" +
        "@keyframes txSlideIn{from{opacity:0;transform:translateY(-30px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}" +
        ".tx-ed-hdr{background:linear-gradient(135deg,#667eea 0%,#764ba2 50%,#f093fb 100%);color:#fff;padding:24px 32px;text-align:center;position:relative;overflow:hidden}" +
        ".tx-ed-title{font-size:24px;font-weight:700;margin:0 0 8px;letter-spacing:-.5px}" +
        ".tx-ed-sub{font-size:14px;opacity:.9;margin:0;font-weight:400}" +
        ".tx-ed-x{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.2);border:none;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;font-size:18px}" +
        ".tx-ed-x:hover{background:rgba(255,255,255,.3)}" +
        ".tx-ed-body{padding:24px 32px}" +
        ".tx-ed-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}" +
        ".tx-ed-fg{display:flex;flex-direction:column}" +
        ".tx-ed-fg.full{grid-column:1/-1}" +
        ".tx-ed-lb{font-size:12px;font-weight:600;color:#9ca3af;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px}" +
        ".tx-ed-in,.tx-ed-sel{background:#1a1a2e;border:1px solid #374151;border-radius:10px;padding:12px 16px;color:#e5e7eb;font-size:14px;outline:none}" +
        ".tx-ed-in:focus,.tx-ed-sel:focus{border-color:#667eea}" +
        ".tx-ed-acts{display:flex;gap:12px;margin-top:24px}" +
        ".tx-ed-btn{flex:1;padding:12px;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer}" +
        ".tx-ed-cancel{background:#374151;color:#9ca3af}" +
        ".tx-ed-cancel:hover{background:#4b5563}" +
        ".tx-ed-save{background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}" +
        ".tx-ed-save:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(59,130,246,.4)}" +
        ".tx-ed-btnwrap{display:inline-flex;margin-left:4px;vertical-align:middle}" +
        ".tx-ed-ebtn{width:30px;height:20px;border-radius:4px;background:rgba(59,130,246,.15);border:1px solid rgba(59,130,246,.3);color:#60a5fa;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
        ".tx-ed-ebtn:hover{background:rgba(59,130,246,.3);border-color:#60a5fa}" +
        ".tx-ed-ebtn svg{width:12px;height:12px;fill:currentColor}";
    }
    function ed_html() {
      return '<div style="position:fixed;top:0;left:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box">' +
        '<div class="tx-ed-box">' +
        '<div class="tx-ed-hdr">' +
        '<h2 class="tx-ed-title">QuotexMaster</h2>' +
        '<p class="tx-ed-sub">Created By @QuotexMaster</p>' +
        '<button class="tx-ed-x" id="tx-ed-x"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>' +
        '</div>' +
        '<div class="tx-ed-body">' +
        '<div class="tx-ed-grid">' +
        '<div class="tx-ed-fg"><label class="tx-ed-lb">Order ID</label><input type="text" id="tx-oid" class="tx-ed-in" placeholder="Enter order ID"></div>' +
        '<div class="tx-ed-fg"><label class="tx-ed-lb">Status</label><select id="tx-st" class="tx-ed-sel"><option value="Waiting confirmation">Waiting confirmation</option><option value="Successed">Successed</option><option value="Failed">Failed</option></select></div>' +
        '<div class="tx-ed-fg"><label class="tx-ed-lb">Date</label><input type="date" id="tx-dt" class="tx-ed-in"></div>' +
        '<div class="tx-ed-fg"><label class="tx-ed-lb">Time</label><input type="time" id="tx-tm" class="tx-ed-in" step="1"></div>' +
        '<div class="tx-ed-fg"><label class="tx-ed-lb">Type</label><select id="tx-tp" class="tx-ed-sel"><option value="Deposit">Deposit</option><option value="Withdrawal">Withdrawal</option></select></div>' +
        '<div class="tx-ed-fg"><label class="tx-ed-lb">Method</label><input type="text" id="tx-mt" class="tx-ed-in" placeholder="Payment method"></div>' +
        '<div class="tx-ed-fg full"><label class="tx-ed-lb">Amount</label><input type="text" id="tx-am" class="tx-ed-in" placeholder="0.00"></div>' +
        '</div>' +
        '<div class="tx-ed-acts">' +
        '<button class="tx-ed-btn tx-ed-cancel" id="tx-ed-cancel">Cancel</button>' +
        '<button class="tx-ed-btn tx-ed-save" id="tx-ed-save">Save Changes</button>' +
        '</div></div></div></div>';
    }
    function ed_fmtDate(d) {
      function p(n) { return String(n).padStart(2, "0"); }
      return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + ", " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
    }
    function ed_parseDate(s) {
      var m = s.match(/(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/);
      if (m) return new Date(m[3], m[2] - 1, m[1]);
      return new Date(s);
    }
    function ed_txId(row) {
      var a = row.getAttribute && row.getAttribute("data-mq-id");
      if (a) return a.trim();
      var e = row.querySelector && row.querySelector(".VZvOf");
      return e ? e.textContent.trim() : null;
    }
    function ed_init(doc, onApply) {
      if (doc.getElementById("tx-ed-bg")) return null;
      var st = doc.createElement("style");
      st.id = "tx-ed-css";
      st.textContent = ed_css();
      (doc.head || doc.documentElement).appendChild(st);
      var bg = doc.createElement("div");
      bg.id = "tx-ed-bg";
      bg.className = "tx-ed-bg modal-overlay transaction-modal-overlay";
      bg.innerHTML = ed_html();
      doc.body.appendChild(bg);
      var cur = null;
      function close() { bg.classList.remove("active"); bg.style.display = "none"; cur = null; }
      bg.querySelector("#tx-ed-x").onclick = close;
      bg.querySelector("#tx-ed-cancel").onclick = close;
      bg.onclick = function(e) { if (e.target === bg) close(); };
      bg.querySelector("#tx-ed-save").onclick = async function() {
        if (!cur) return;
        var data = {
          id: bg.querySelector("#tx-oid").value,
          status: bg.querySelector("#tx-st").value,
          type: bg.querySelector("#tx-tp").value,
          method: bg.querySelector("#tx-mt").value,
          amount: bg.querySelector("#tx-am").value,
          date: (function() {
            var dd = bg.querySelector("#tx-dt").value, tt = bg.querySelector("#tx-tm").value;
            if (dd && tt) return ed_fmtDate(new Date(dd + "T" + tt));
            return "";
          })()
        };
        var id = ed_txId(cur);
        if (id) {
          var ed = {};
          try { var s = await chrome.storage.local.get([ED_STORAGE_KEY]); ed = s[ED_STORAGE_KEY] || {}; } catch(e) {}
          ed[id] = data;
          try { var obj = {}; obj[ED_STORAGE_KEY] = ed; await chrome.storage.local.set(obj); } catch(e2) {}
          if (onApply) onApply(cur, data);
        }
        close();
      };
      function show(row) {
        cur = row;
        var id = ed_txId(row);
        chrome.storage.local.get([ED_STORAGE_KEY], function(s) {
          var ed = (s[ED_STORAGE_KEY] || {})[id] || {};
          bg.querySelector("#tx-oid").value = ed.id || (row.querySelector && row.querySelector(".VZvOf") ? row.querySelector(".VZvOf").textContent.trim() : "");
          bg.querySelector("#tx-st").value = ed.status || (row.querySelector && row.querySelector(".VgSqu.gvdfF") ? row.querySelector(".VgSqu.gvdfF").textContent.trim() : "Waiting confirmation");
          bg.querySelector("#tx-tp").value = ed.type || (row.querySelector && row.querySelector(".Ed7UM") ? row.querySelector(".Ed7UM").textContent.trim() : "Deposit");
          bg.querySelector("#tx-mt").value = ed.method || (row.querySelector && row.querySelector(".R1N82") ? row.querySelector(".R1N82").textContent.trim() : "");
          bg.querySelector("#tx-am").value = ed.amount || "";
          var raw = ed.date || (row.querySelector && row.querySelector(".Sf_Tx") ? row.querySelector(".Sf_Tx").textContent.trim() : "");
          if (raw) {
            try {
              var dt = ed_parseDate(raw);
              bg.querySelector("#tx-dt").value = dt.toISOString().split("T")[0];
              function p2(n) { return String(n).padStart(2, "0"); }
              bg.querySelector("#tx-tm").value = p2(dt.getHours()) + ":" + p2(dt.getMinutes()) + ":" + p2(dt.getSeconds());
            } catch(x) {}
          }
          bg.classList.add("active");
          bg.style.display = "flex";
        });
      }
      function addBtn(row) {
        if (row.querySelector(".tx-ed-ebtn")) return;
        var b = doc.createElement("button");
        b.className = "tx-ed-ebtn";
        b.innerHTML = '<svg height="1em" viewBox="0 0 512 512"><path d="M410.3 231l11.3-11.3-33.9-33.9-62.1-62.1L291.7 89.8l-11.3 11.3-22.6 22.6L58.6 322.9c-10.4 10.4-18 23.3-22.2 37.4L1 480.7c-2.5 8.4-.2 17.5 6.1 23.7s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L387.7 253.7 410.3 231zM160 399.4l-9.1 22.7c-4 3.1-8.5 5.4-13.3 6.9L59.4 452l23-78.1c1.4-4.9 3.8-9.4 6.9-13.3l22.7-9.1v32c0 8.8 7.2 16 16 16h32zM362.7 18.7L348.3 33.2 325.7 55.8 314.3 67.1l33.9 33.9 62.1 62.1 33.9 33.9 11.3-11.3 22.6-22.6 14.5-14.5c25-25 25-65.5 0-90.5L453.3 18.7c-25-25-65.5-25-90.5 0zm-47.4 168l-144 144c-6.2 6.2-16.4 6.2-22.6 0s-6.2-16.4 0-22.6l144-144c6.2-6.2 16.4-6.2 22.6 0s6.2 16.4 0 22.6z"/></svg>';
        b.onclick = function() { show(row); };
        var w = doc.createElement("div");
        w.className = "tx-ed-btnwrap";
        w.appendChild(b);
        var t = row.querySelector(".vKozV") || row;
        t.appendChild(w);
      }
      function applyRow(row, data) {
        if (data.status) { var e = row.querySelector(".VgSqu.gvdfF"); if (e) e.textContent = data.status; }
        if (data.type) { var e2 = row.querySelector(".Ed7UM"); if (e2) e2.textContent = data.type; }
        if (data.method) { var e3 = row.querySelector(".R1N82"); if (e3) e3.textContent = data.method; }
        if (data.amount) { var e4 = row.querySelector(".lekbj"); if (e4) e4.textContent = data.amount; }
        if (data.date) { var e5 = row.querySelector(".Sf_Tx"); if (e5) e5.textContent = data.date; }
      }
      function observe() {
        var obs = new MutationObserver(function(ms) {
          ms.forEach(function(m) {
            m.addedNodes.forEach(function(n) {
              if (n.nodeType !== 1) return;
              if (n.classList && n.classList.contains("vDMA1")) { addBtn(n); applyRow(n); return; }
              if (n.querySelectorAll) {
                var rows = n.querySelectorAll(".vDMA1");
                if (rows) rows.forEach(function(r) { addBtn(r); applyRow(r); });
              }
            });
          });
        });
        obs.observe(doc.body, { childList: true, subtree: true });
        setTimeout(function() {
          var rows = doc.querySelectorAll(".vDMA1");
          if (rows) rows.forEach(function(r) { addBtn(r); applyRow(r); });
        }, 200);
      }
      observe();
      return { show: show, addBtn: addBtn, applyRow: applyRow, overlay: bg };
    }
    exports.initEditor = ed_init;
    exports.css = ed_css;
    exports.html = ed_html;
  `,
};

import { validateLicense as validateKey } from "../lib/validate.js";

export default async function handler(req, res) {
  setCORS(res);
  if (handleOPTIONS(req, res)) return;

  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  try {
    const { moduleId } = req.body || {};

    if (!moduleId)
      return res.status(400).json({ error: "moduleId required" });

    /* ── FULL LICENSE VALIDATION (status + expiry) ── */
    const auth = await validateKey(req);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const code = MODULES[moduleId];
    if (!code)
      return res.status(404).json({ error: "MODULE_NOT_FOUND" });

    const encrypted = await encrypt(code.trim(), auth.licenseKey);
    return res.status(200).json(encrypted);

  } catch (err) {
    console.error("code delivery error:", err);
    return res.status(500).json({ error: "CODE_DELIVERY_FAILED" });
  }
}
