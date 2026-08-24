import { db } from "../../../lib/firebase.js";

function send(res, status, data) {
    return res.status(status).json(data);
}

function getPathParts(req) {
    const raw = req.query?.path;

    if (Array.isArray(raw)) {
        return raw.map(String);
    }

    if (typeof raw === "string" && raw.length > 0) {
        return raw.split("/").filter(Boolean);
    }

    return [];
}

function isSafeKey(value) {
    return (
        typeof value === "string" &&
        value.length > 0 &&
        !/[.#$[\]/]/.test(value)
    );
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, PUT, OPTIONS"
    );
    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Accept, Cache-Control"
    );

    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }

    try {
        const parts = getPathParts(req);

        /*
         * Expected:
         *
         * /api/extension_access/LICENSE
         * /api/extension_access/LICENSE/fingerprint
         * /api/extension_access/LICENSE/lastUsed
         * /api/extension_access/LICENSE/lastModified
         */

        if (parts.length < 1 || parts.length > 2) {
            return send(res, 400, {
                error: "INVALID_LICENSE_PATH"
            });
        }

        const licenseKey = parts[0];
        const field = parts[1] || null;

        if (!isSafeKey(licenseKey)) {
            return send(res, 400, {
                error: "INVALID_LICENSE_KEY"
            });
        }

        const allowedFields = [
            "fingerprint",
            "lastUsed",
            "lastModified"
        ];

        if (field && !allowedFields.includes(field)) {
            return send(res, 400, {
                error: "INVALID_LICENSE_FIELD"
            });
        }

        const refPath = field
            ? `extension_access/${licenseKey}/${field}`
            : `extension_access/${licenseKey}`;

        const ref = db.ref(refPath);

        // Existing extension uses GET for license validation.
        if (req.method === "GET") {
            const snapshot = await ref.once("value");

            if (!snapshot.exists()) {
                return send(res, 404, null);
            }

            return send(res, 200, snapshot.val());
        }

        // Existing extension uses PUT for fingerprint/lastUsed/lastModified.
        if (req.method === "PUT") {
            if (!field) {
                return send(res, 405, {
                    error: "DIRECT_LICENSE_WRITE_NOT_ALLOWED"
                });
            }

            await ref.set(req.body);

            return send(res, 200, req.body);
        }

        return send(res, 405, {
            error: "METHOD_NOT_ALLOWED"
        });

    } catch (error) {
        console.error("Extension access error:", error);

        return send(res, 500, {
            error: "LICENSE_SERVER_ERROR"
        });
    }
}
