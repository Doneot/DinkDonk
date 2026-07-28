import type {
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
} from "firebase-admin/firestore";

import { isNonEmptyString } from "./validators.js";

/**
 * Fetches a document by id, returning null for a blank id or a document
 * that doesn't exist. Collapses the guard-fetch-exists-check boilerplate
 * repeated across the Firestore repositories into one call.
 */
export async function getExistingDoc(
  collection: CollectionReference<DocumentData>,
  id: string,
): Promise<DocumentSnapshot<DocumentData> | null> {
  if (!isNonEmptyString(id)) {
    return null;
  }

  const doc = await collection.doc(id).get();

  return doc.exists ? doc : null;
}
