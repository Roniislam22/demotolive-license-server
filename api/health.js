import { db } from "../lib/firebase.js";

export default async function handler(req, res) {
    try {
        const snapshot = await db.ref("server_test").once("value");

        return res.status(200).json({
            success: true,
            firebase: true,
            data: snapshot.val()
        });
    } catch (error) {
        console.error("Firebase error:", error);

        return res.status(500).json({
            success: false,
            firebase: false,
            error: "Firebase connection failed"
        });
    }
}
