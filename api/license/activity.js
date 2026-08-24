import { db } from "../../lib/firebase.js";

function send(res, status, body) {
    return res.status(status).json(body);
}

function isSafeLicenseKey(value) {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        !/[.#$[\]/]/.test(value)
    );
}

function isExpired(expireAt) {
    if (!expireAt) return false;

    const expiry = new Date(`${expireAt}T23:59:59.999Z`);

    if (Number.isNaN(expiry.getTime())) {
        return false;
    }

    return Date.now() > expiry.getTime();
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    if (req.method !== "POST") {
        return send(res, 405, {
            success: false,
            error: "METHOD_NOT_ALLOWED"
        });
    }

    try {
        const {
            licenseKey,
            fingerprint,
            action
        } = req.body || {};

        if (!isSafeLicenseKey(licenseKey)) {
            return send(res, 400, {
                success: false,
                error: "INVALID_LICENSE_KEY"
            });
        }

        if (!fingerprint || typeof fingerprint !== "string") {
            return send(res, 400, {
                success: false,
                error: "FINGERPRINT_REQUIRED"
            });
        }

        const allowedActions = [
            "activate",
            "heartbeat"
        ];

        if (!allowedActions.includes(action)) {
            return send(res, 400, {
                success: false,
                error: "INVALID_ACTION"
            });
        }

        const licenseRef = db.ref(`extension_access/${licenseKey}`);
        const snapshot = await licenseRef.once("value");

        if (!snapshot.exists()) {
            return send(res, 404, {
                success: false,
                error: "LICENSE_NOT_FOUND"
            });
        }

        const license = snapshot.val() || {};

        if (license.status !== "active") {
            return send(res, 403, {
                success: false,
                error: "LICENSE_INACTIVE"
            });
        }

        if (isExpired(license.expire_at)) {
            return send(res, 403, {
                success: false,
                error: "LICENSE_EXPIRED"
            });
        }

        // Existing device binding must match.
        if (
            license.fingerprint &&
            license.fingerprint !== fingerprint
        ) {
            return send(res, 403, {
                success: false,
                error: "LICENSE_ALREADY_USED_ON_ANOTHER_DEVICE"
            });
        }

        const now = new Date().toISOString();

        const updates = {
            lastUsed: now,
            last_seen: now
        };

        // First activation binds the license.
        if (!license.fingerprint && action === "activate") {
            updates.fingerprint = fingerprint;
            updates.lastModified = now;
        }

        await licenseRef.update(updates);

        return send(res, 200, {
            success: true,
            data: {
                status: license.status,
                lastUsed: now,
                last_seen: now
            }
        });

    } catch (error) {
        console.error("License activity error:", error);

        return send(res, 500, {
            success: false,
            error: "LICENSE_SERVER_ERROR"
        });
    }
}
