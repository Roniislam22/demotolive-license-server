import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

function getFirebaseApp() {
    if (getApps().length > 0) {
        return getApps()[0];
    }

    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!privateKey) {
        throw new Error("FIREBASE_PRIVATE_KEY is missing");
    }

    return initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
}

const app = getFirebaseApp();

export const db = getDatabase(app);
