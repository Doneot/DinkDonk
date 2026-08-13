import type { ServiceAccount } from "firebase-admin";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";

import { assertDefined } from "../utils/assert.js";
import { env } from "./env.js";

export function createFirestore(): Firestore {
  if (!getApps().length) {
    if (env.firebase.serviceAccountPath) {
      initializeApp({
        credential: applicationDefault(),
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
      initializeApp({
        credential: cert(serviceAccount),
      });
    }
  }

  return getFirestore();
}
