import { db } from "../lib/firebase.js";

const MAX_LICENSE_LENGTH = 128;
const MAX_FINGERPRINT_LENGTH = 4096;

function send(res, status, body) {
    return res.status(status).json(body);
}

function normalize(value, maxLength) {
    if (typeof value !== "string") {
        return "";
    }

    const result = value.trim();

    if (result.length > maxLength) {
        return "";
    }

    return result;
}

function isSafeLicenseKey(value) {
    return (
        value.length > 0 &&
        value.length <= MAX_LICENSE_LENGTH &&
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
    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept"
    );
    res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate"
    );

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
        const body = req.body;

        if (
            !body ||
            typeof body !== "object" ||
            Array.isArray(body)
        ) {
            return send(res, 400, {
                success: false,
                error: "INVALID_REQUEST_BODY"
            });
        }

        const licenseKey = normalize(
            body.licenseKey,
            MAX_LICENSE_LENGTH
        );

        const fingerprint = normalize(
            body.fingerprint,
            MAX_FINGERPRINT_LENGTH
        );

        const action = normalize(body.action, 32);

        if (!isSafeLicenseKey(licenseKey)) {
            return send(res, 400, {
                success: false,
                error: "INVALID_LICENSE_KEY"
            });
        }

        if (!fingerprint) {
            return send(res, 400, {
                success: false,
                error: "FINGERPRINT_REQUIRED"
            });
        }

        if (
            action !== "activate" &&
            action !== "heartbeat"
        ) {
            return send(res, 400, {
                success: false,
                error: "INVALID_ACTION"
            });
        }

        const licenseRef = db.ref(
            `extension_access/${licenseKey}`
        );

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

        /*
         * If already bound, fingerprint must match.
         */
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

        /*
         * Only the activation request may establish
         * the first device binding.
         */
        if (
            action === "activate" &&
            !license.fingerprint
        ) {
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
        console.error("Activity error:", error);
        return send(res, 500, {
            success: false,
            error: "ACTIVITY_SERVER_ERROR"
        });
    }
}
