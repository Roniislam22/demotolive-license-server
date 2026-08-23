import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

function getFirebaseApp() {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const databaseURL = process.env.FIREBASE_DATABASE_URL;

    if (!projectId) {
        throw new Error("FIREBASE_PROJECT_ID is missing");
    }

    if (!clientEmail) {
        throw new Error("FIREBASE_CLIENT_EMAIL is missing");
    }

    if (!privateKey) {
        throw new Error("FIREBASE_PRIVATE_KEY is missing");
    }

    if (!databaseURL) {
        throw new Error("FIREBASE_DATABASE_URL is missing");
    }

    return initializeApp({
        credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, "\n")
        }),
        databaseURL
    });
}

const app = getFirebaseApp();

export const db = getDatabase(app);
