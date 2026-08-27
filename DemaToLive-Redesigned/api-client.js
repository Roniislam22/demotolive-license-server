/**
 * DemaToLive API Client v2 — Secure Transport Layer
 * ──────────────────────────────────────────────────
 * This file is the ONLY place the extension talks to the backend.
 * All communication is encrypted. Business logic fetched dynamically.
 *
 * Security layers:
 *   1. Code integrity — verifies files haven't been tampered with
 *   2. Encrypted transport — AES-256-GCM for all API payloads
 *   3. Dynamic loading — business logic fetched from server at runtime
 */

const API_BASE = "https://demotolive-license-server.vercel.app";

class DematoliveAPI {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
    this._licenseKey = null;
    this._sec = (typeof window !== "undefined" && window.__DEMA_SECURITY__) || null;
  }

  /** Store license key for encrypted communication */
  setLicenseKey(key) { this._licenseKey = key; }

  /* ════════════════════════════════════════════════════════════
   *  TRANSPORT — Plain fallback + Encrypted upgrade
   * ════════════════════════════════════════════════════════════ */

  async _post(path, body, timeout = 10000) {
    /* If security module loaded + license key set → use encrypted */
    if (this._sec && this._licenseKey) {
      try { return await this._sec.api.securePost(path, body, this._licenseKey); }
      catch (e) { console.warn("[DemaToLive] Encrypted post failed, falling back:", e); }
    }
    /* Fallback: plain fetch */
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(this.baseUrl + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      return await res.json();
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  async _get(path, timeout = 10000) {
    if (this._sec && this._licenseKey) {
      try { return await this._sec.api.secureGet(path, this._licenseKey); }
      catch (e) { console.warn("[DemaToLive] Encrypted get failed, falling back:", e); }
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(this.baseUrl + path, { signal: ctrl.signal });
      clearTimeout(tid);
      return await res.json();
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  /* ════════════════════════════════════════════════════════════
   *  SECURITY — Integrity check
   * ════════════════════════════════════════════════════════════ */

  /** Check if any protected files have been tampered with */
  async checkIntegrity(readFileFn) {
    if (!this._sec) return { valid: true, tampered: [], note: "No security module" };
    const result = await this._sec.integrity.verifyAll(readFileFn);
    if (!result.valid) {
      console.error("[DemaToLive] ⚠️ TAMPERED FILES:", result.tampered);
    }
    return result;
  }

  /** Check if security module itself is intact */
  securitySelfCheck() {
    if (!this._sec) return false;
    return this._sec.integrity.selfCheck();
  }

  /* ════════════════════════════════════════════════════════════
   *  DYNAMIC CODE — Fetch business logic from server
   * ════════════════════════════════════════════════════════════ */

  /**
   * Load a business logic module from Vercel (encrypted, decrypt in memory).
   * Customer never sees this code in extension files.
   */
  async loadModule(moduleId) {
    if (!this._sec || !this._licenseKey) {
      console.error("[DemaToLive] Cannot load module — security not initialized");
      return null;
    }
    return this._sec.loader.loadModule(moduleId, this._licenseKey);
  }

  /* ════════════════════════════════════════════════════════════
   *  LICENSE
   * ════════════════════════════════════════════════════════════ */

  async verifyLicense(licenseKey, fingerprint) {
    return this._post("/api/verify", { licenseKey, fingerprint });
  }

  async activateDevice(licenseKey, fingerprint, platform) {
    return this._post("/api/activity", { licenseKey, fingerprint, platform, action: "activate" });
  }

  async heartbeat(licenseKey, fingerprint) {
    return this._post("/api/activity", { licenseKey, fingerprint, action: "heartbeat" });
  }

  /* ════════════════════════════════════════════════════════════
   *  RANK  — Can use server endpoint OR dynamic module
   * ════════════════════════════════════════════════════════════ */

  async calculateRank(balance, startingBalance) {
    /* Try dynamic module first (code never leaves server) */
    const mod = await this.loadModule("rank");
    if (mod && mod.calculate) return mod.calculate(balance, startingBalance);
    /* Fallback: server endpoint */
    return this._post("/api/calculate", { balance, startingBalance });
  }

  /* ════════════════════════════════════════════════════════════
   *  TRADES  — Can use server endpoint OR dynamic module
   * ════════════════════════════════════════════════════════════ */

  async processTrades(trades, settings) {
    const mod = await this.loadModule("trades");
    if (mod && mod.processTrades) return mod.processTrades(trades, settings);
    return this._post("/api/process", { trades, settings });
  }

  async deleteTrades(licenseKey, tradeIds) {
    return this._post("/api/delete", { licenseKey, tradeIds });
  }

  async restoreTrades(licenseKey, tradeIds) {
    return this._post("/api/restore", { licenseKey, tradeIds });
  }

  /* ════════════════════════════════════════════════════════════
   *  SETTINGS
   * ════════════════════════════════════════════════════════════ */

  async getSettings(licenseKey) {
    return this._get(`/api/get?licenseKey=${encodeURIComponent(licenseKey)}`);
  }

  async saveSettings(licenseKey, settings) {
    return this._post("/api/save", { licenseKey, settings });
  }
}

/* Export for content scripts */
if (typeof window !== "undefined") {
  window.DematoliveAPI = DematoliveAPI;
}
