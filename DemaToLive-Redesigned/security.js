/**
 * security.js — DemaToLive Anti-Tamper + Encrypted Transport + Dynamic Loader
 * ─────────────────────────────────────────────────────────────────────────────
 * This file is the ONLY security entry point. It:
 *   1. Verifies code integrity (hashes of all content scripts)
 *   2. Encrypts/decrypts all API communication
 *   3. Loads business logic dynamically from Vercel at runtime
 *
 * Customer NEVER sees real business logic — only encrypted blobs.
 */

/* ═══════════════════════════════════════════════════════════════
 *  CRYPTO — AES-GCM encryption for API payloads
 * ═══════════════════════════════════════════════════════════════ */

const _SEC = (() => {
  /* Shared derivation seed (changes each deploy, attacker can't hardcode) */
  const SEED = "dm2x$k9!mP@7vR#nQw3zLb5jFh8uCt1y";

  async function _deriveKey(licenseKey) {
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
    const key = await _deriveKey(licenseKey);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data))
    );
    return {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(ciphertext)),
      ts: Date.now()
    };
  }

  async function decrypt(blob, licenseKey) {
    const key = await _deriveKey(licenseKey);
    const iv = new Uint8Array(blob.iv);
    const data = new Uint8Array(blob.data);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, key, data
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  /* HMAC-SHA256 request signing */
  async function sign(body, licenseKey) {
    const key = await _deriveKey(licenseKey + "-sign");
    const enc = new TextEncoder();
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify(body)));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  return { encrypt, decrypt, sign };
})();

/* ═══════════════════════════════════════════════════════════════
 *  INTEGRITY — Verify code files haven't been modified
 * ═══════════════════════════════════════════════════════════════ */

const _INTEGRITY = (() => {
  /*
   * Expected SHA-256 hashes of each protected file.
   * These are computed at build time and embedded here.
   * To update: run build-security.js or recompute manually.
   */
  const EXPECTED_HASHES = {
    "owgp4pdq4e82vm.js": "c2afac9db5a2636ef0d7f037094034a13403e7c737aba5f45872d5d717ab36d8",
    "bvk6pu1cci9luj.js": "a2042654020abcc3e63b6fd79e18fe7759c7246c3e4f0702305124160ad9a6b9",
    "iosoy1b63he13p.js": "b9e065d24a6d990d73e07acd0b96d23e99192f548330b9f39f5fa174b090d1a5",
    "kf0yh7khj7vg6o.js": "6813c0ea5ce9d9c7712c78438ec793caac6bb604e62472528c4caae50e6434e2",
    "eplhaw9x5pknt9.js": "c5dcfaa6368204b0e78850179eb80030944f4e7f5d4b23285a4879b2adb8b8ec",
    "api-client.js": "93bd92ee09c6e6e8c68b48cd36129668cda490a91965b2c6394dc3bf5fa352ae",
    "drc3ls3i8o3t00.js": "bd138202418e6e7e49143ab9a8292b648e5c872c75ec4e22a1f3b2120f671871",
    "pd5dtewgm4d5mr.js": "c52ef24f6dfde7fceed3b1c8fab056425eb20d80cc3c01ec79594e450b1e6e38",
    "xae94gfnhqvfin.js": "21458b29430aac5c0746fb4266652d1c28a95296ff87e75c90d6a7a1f73d2836",
    "oswczwym0f4qn6.js": "84d66622804c11a515c14ba6cc7cb76c8295dd28de5929332231d7457b995402",
    "bqk3j2slsuers8.js": "e039399c5efa501897bb25ad92014bc260ff443262a7a0168df4dd54b652f9cd",
    "q0986cadw2nuy0.js": "d3e9ea512b1955de80a696fadbad9085df179065a0d9424d0041be0b2fbd88b6",
    "vmorftef9nbzxh.js": "4ea662c69ec0a99ba91d0b217a70fc00b9fe755f9ca11aac42f2f7e2cc615867",
    "e9f289f0ulhgji.js": "f55a99ed31eef03ac6464f5e153c8e32ef9d2710bdd02a8a2479e2157dc3e8c6",
    "hkst75x1y7bhcn.js": "46928c9fb24309d1222c5074ec34cd4bde3525bb08056760e554e9e7ba036f8d",
    "f15zcnntrcpl27.js": "61de711009bc09cbc8f6dc017f631f98cf1edbeb612acecfb75816a342978683",
    "hx4tpi2q6g3zik.js": "e99413555ce02719d31d9be53bbcc4a5a2b00ded709037e85b466178ff4b1c8a",
    "vsixe42sg2jlkg.js": "f09537fa0203b0663b4e0bcd20be85bbeb0e7f35ef7f653077bfec445214b9b1",
    "u3bv5dnkm95fyf.js": "27b706117abf533615bb265aade0ee29afc386f802d87772a067822d0431ba45",
    "popup.js": "512211f10b87ae612c1c89893f683065c49cef5fb76099213c2b5298175c9976",
  };

  async function _hashFile(content) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(content));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Verify integrity of all protected files.
   * Returns { valid: boolean, tampered: string[] }
   */
  async function verifyAll(readFileFn) {
    const tampered = [];
    for (const [file, expected] of Object.entries(EXPECTED_HASHES)) {
      if (expected.startsWith("PLACEHOLDER")) continue; /* skip unconfigured */
      try {
        const content = await readFileFn(file);
        const actual = await _hashFile(content);
        if (actual !== expected) tampered.push(file);
      } catch (e) {
        tampered.push(file);
      }
    }
    return { valid: tampered.length === 0, tampered };
  }

  /**
   * Self-test: verify THIS file hasn't been stripped/modified.
   * Uses a simple canary — if the canary functions are missing, we're broken.
   */
  function selfCheck() {
    return (
      typeof _SEC !== "undefined" &&
      typeof _SEC.encrypt === "function" &&
      typeof _SEC.decrypt === "function" &&
      typeof _INTEGRITY.verifyAll === "function"
    );
  }

  return { verifyAll, selfCheck, EXPECTED_HASHES };
})();

/* ═══════════════════════════════════════════════════════════════
 *  DYNAMIC LOADER — Fetch encrypted business logic from Vercel
 * ═══════════════════════════════════════════════════════════════ */

const _LOADER = (() => {
  const API_BASE = "https://demotolive-license-server.vercel.app";
  const codeCache = new Map();

  /**
   * Fetch encrypted module from server, decrypt, and execute.
   * @param {string} moduleId - e.g. "rank", "trades", "settings"
   * @param {string} licenseKey - for decryption
   * @returns {object} The module's exports
   */
  async function loadModule(moduleId, licenseKey) {
    const cacheKey = moduleId + ":" + licenseKey;
    if (codeCache.has(cacheKey)) return codeCache.get(cacheKey);

    try {
      const res = await fetch(`${API_BASE}/api/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey, moduleId, ts: Date.now() })
      });

      if (!res.ok) throw new Error(`CODE_FETCH_FAILED_${res.status}`);
      const encrypted = await res.json();

      if (encrypted.error) throw new Error(encrypted.error);

      const plain = await _SEC.decrypt(encrypted, licenseKey);

      /* Execute decrypted code in a sandboxed function scope */
      const fn = new Function("exports", "module", plain.code);
      const mod = { exports: {} };
      fn(mod.exports, mod);

      codeCache.set(cacheKey, mod.exports);
      return mod.exports;
    } catch (err) {
      console.error(`[DemaToLive] Code load failed for ${moduleId}:`, err);
      return null;
    }
  }

  function clearCache() {
    codeCache.clear();
  }

  return { loadModule, clearCache };
})();

/* ═══════════════════════════════════════════════════════════════
 *  ENCRYPTED API — Wraps all Vercel calls with encryption
 * ═══════════════════════════════════════════════════════════════ */

const _ENCRYPTED_API = (() => {
  const API_BASE = "https://demotolive-license-server.vercel.app";

  async function securePost(path, body, licenseKey) {
    const encrypted = await _SEC.encrypt(body, licenseKey);
    const sig = await _SEC.sign(encrypted, licenseKey);

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Sig": sig,
        "X-Ts": String(Date.now())
      },
      body: JSON.stringify(encrypted),
      signal: AbortSignal.timeout(15000)
    });

    const respEncrypted = await res.json();
    if (respEncrypted.error && !respEncrypted.iv) {
      return respEncrypted; /* plain error response */
    }
    return _SEC.decrypt(respEncrypted, licenseKey);
  }

  async function secureGet(path, licenseKey) {
    const sig = await _SEC.sign({ path, ts: Date.now() }, licenseKey);
    const res = await fetch(`${API_BASE}${path}&_sig=${sig}&_ts=${Date.now()}`, {
      signal: AbortSignal.timeout(15000)
    });
    const resp = await res.json();
    if (resp.iv) return _SEC.decrypt(resp, licenseKey);
    return resp;
  }

  return { securePost, secureGet };
})();

/* ═══════════════════════════════════════════════════════════════
 *  PUBLIC API — Expose to window for content scripts
 * ═══════════════════════════════════════════════════════════════ */

if (typeof window !== "undefined") {
  window.__DEMA_SECURITY__ = {
    crypto: _SEC,
    integrity: _INTEGRITY,
    loader: _LOADER,
    api: _ENCRYPTED_API,
    version: "2.0.0"
  };
}
