import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type { AuthUser } from "../../../auth/domain/AuthUser.js";
import type { AuthUserRepository } from "../../ports/AuthUserRepository.js";
import type { AuthUserUpdate } from "../../domain/AuthUserUpdate.js";
import {
  AuthUserRecordSchema,
  AuthUserUpdateSchema,
} from "./records/AuthUserRecord.js";

import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { decryptSecret, encryptSecret } from "../../../../shared/utils/crypto.js";
import { getExistingDoc } from "../../../../shared/utils/firestore.js";
import { toAuthUser } from "./mappers/authUserMapper.js";

export class FirestoreAuthUserRepository implements AuthUserRepository {
  private readonly users: CollectionReference<DocumentData>;

  constructor(db: Firestore) {
    this.users = db.collection("auth");
  }

  async checkConnection(): Promise<void> {
    await this.users.limit(1).get();
  }

  async getAuthUser(userId: string): Promise<AuthUser | null> {
    const doc = await getExistingDoc(this.users, userId);

    if (!doc) {
      return null;
    }

    const record = AuthUserRecordSchema.parse(doc.data());

    return toAuthUser(doc.id, {
      ...record,
      accessToken: decryptSecret(record.accessToken),
      refreshToken: decryptSecret(record.refreshToken),
    });
  }

  async updateAuthUser(userId: string, data: AuthUserUpdate): Promise<void> {
    if (!isNonEmptyString(userId)) {
      throw new Error("Invalid user id");
    }

    const validated = AuthUserUpdateSchema.parse(data);

    const payload = {
      ...validated,
      ...(validated.accessToken !== undefined
        ? { accessToken: encryptSecret(validated.accessToken) }
        : {}),
      ...(validated.refreshToken !== undefined
        ? { refreshToken: encryptSecret(validated.refreshToken) }
        : {}),
    };

    await this.users.doc(userId).set(payload, { merge: true });
  }
}
