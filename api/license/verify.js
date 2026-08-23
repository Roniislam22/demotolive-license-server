import { db } from "../../lib/firebase.js";

function send(res, status, body) {
    return res.status(status).json(body);
}

function normalizeLicenseKey(value) {
    return String(value || "").trim();
}

function normalizeFingerprint(value) {
    return String(value || "").trim();
}

function isExpired(expireAt) {
    if (!expireAt) return false;

    // Supports your existing YYYY-MM-DD format.
    const expiry = new Date(`${expireAt}T23:59:59.999Z`);

    if (Number.isNaN(expiry.getTime())) {
        return false;
    }

    return Date.now() > expiry.getTime();
}

export default async function handler(req, res) {
    // Allow extension requests.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        return send(res, 405, {
            valid: false,
            error: "METHOD_NOT_ALLOWED"
        });
    }

    try {
        const body = req.body || {};

        const licenseKey = normalizeLicenseKey(body.licenseKey);
        const fingerprint = normalizeFingerprint(body.fingerprint);

        if (!licenseKey) {
            return send(res, 400, {
                valid: false,
                error: "LICENSE_KEY_REQUIRED"
            });
        }

        if (!fingerprint) {
            return send(res, 400, {
                valid: false,
                error: "FINGERPRINT_REQUIRED"
            });
        }

        // Prevent path traversal / malformed Firebase paths.
        if (
            licenseKey.includes("/") ||
            licenseKey.includes(".") ||
            licenseKey.includes("#") ||
            licenseKey.includes("$") ||
            licenseKey.includes("[") ||
            licenseKey.includes("]")
        ) {
            return send(res, 400, {
                valid: false,
                error: "INVALID_LICENSE_KEY"
            });
        }

        const licenseRef = db.ref(`extension_access/${licenseKey}`);
        const snapshot = await licenseRef.once("value");

        if (!snapshot.exists()) {
            return send(res, 404, {
                valid: false,
                error: "LICENSE_NOT_FOUND"
            });
        }

        const license = snapshot.val() || {};

        // Status check
        if (license.status !== "active") {
            return send(res, 403, {
                valid: false,
                error: `LICENSE_${String(license.status || "INVALID").toUpperCase()}`
            });
        }

        // Expiry check
        if (isExpired(license.expire_at)) {
            return send(res, 403, {
                valid: false,
                error: "LICENSE_EXPIRED",
                expire_at: license.expire_at || null
            });
        }

        // Existing device binding
        if (
            license.fingerprint &&
            license.fingerprint !== fingerprint
        ) {
            return send(res, 403, {
                valid: false,
                error: "LICENSE_ALREADY_USED_ON_ANOTHER_DEVICE"
            });
        }

        const now = new Date().toISOString();

        // First activation: bind license to this device.
        if (!license.fingerprint) {
            await licenseRef.update({
                fingerprint,
                lastUsed: now,
                lastModified: now,
                last_seen: now
            });
        } else {
            // Existing valid device.
            await licenseRef.update({
                lastUsed: now,
                last_seen: now
            });
        }

        return send(res, 200, {
            valid: true,
            data: {
                status: license.status,
                name: license.name || "",
                expire_at: license.expire_at || null,
                issued_at: license.issued_at || null,
                lastUsed: now,
                last_seen: now
            },
            userName: license.name || ""
        });

    } catch (error) {
        console.error("License verification error:", error);

        return send(res, 500, {
            valid: false,
            error: "LICENSE_SERVER_ERROR"
        });
    }
}
