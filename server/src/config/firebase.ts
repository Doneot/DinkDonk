import type { ServiceAccount } from "firebase-admin";
import admin from "firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { env } from "./env.js";
import { assertDefined } from "../utils/assert.js";

export function createFirestore(): Firestore {
  if (!admin.apps.length) {
    if (env.firebase.serviceAccountPath) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    } else {
      const serviceAccount: ServiceAccount = {
        projectId: assertDefined(env.firebase.projectId, "Firebase Project ID"),
        privateKey: assertDefined(
          env.firebase.privateKey,
          "Firebase Private Key",
        ),
        clientEmail: assertDefined(
          env.firebase.clientEmail,
          "Firebase Client Email",
        ),
      };
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  }

  return getFirestore();
}
