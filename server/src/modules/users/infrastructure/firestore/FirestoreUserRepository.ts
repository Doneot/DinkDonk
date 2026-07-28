import type {
  Firestore,
  CollectionReference,
  DocumentData,
} from "firebase-admin/firestore";

import type { UserRepository } from "../../ports/UserRepository.js";
import type { User } from "../../domain/User.js";
import type { UserUpdate } from "../../domain/UserUpdate.js";
import { UserRecordSchema, UserUpdateSchema } from "./records/UserRecord.js";
import { toUser } from "./mappers/userMapper.js";

import { isNonEmptyString } from "../../../../shared/utils/validators.js";
import { getExistingDoc } from "../../../../shared/utils/firestore.js";

export class FirestoreUserRepository implements UserRepository {
  private readonly users: CollectionReference<DocumentData>;

  constructor(db: Firestore) {
    this.users = db.collection("users");
  }

  async getUser(userId: string): Promise<User | null> {
    const doc = await getExistingDoc(this.users, userId);

    if (!doc) {
      return null;
    }

    return toUser(doc.id, UserRecordSchema.parse(doc.data()));
  }

  async getUsers(): Promise<User[]> {
    const snapshot = await this.users.get();

    return snapshot.docs.map((doc) => {
      const record = UserRecordSchema.parse(doc.data());

      return toUser(doc.id, record);
    });
  }

  async updateUser(userId: string, data: UserUpdate): Promise<void> {
    if (!isNonEmptyString(userId)) {
      throw new Error("Invalid user id");
    }

    const validated = UserUpdateSchema.parse(data);

    await this.users.doc(userId).set(validated, { merge: true });
  }

  async countUsersReceivingDM(): Promise<number> {
    const snapshot = await this.users
      .where("canReceiveDM", "==", true)
      .count()
      .get();

    return snapshot.data().count;
  }
}
