import type { Firestore } from "firebase-admin/firestore";

export type DocumentData = Record<string, unknown>;

type SetOptions = { merge?: boolean };

/**
 * Minimal in-process stand-in for the Firestore surface the repositories use:
 * collections, documents, sub-collections, merge writes and transactions.
 *
 * It is deliberately not a general Firestore emulator — it exists so the
 * Firestore-specific repository behaviour (document shapes, merge semantics,
 * transactional read-modify-write) can be asserted without a network.
 */
export class FakeFirestore {
  private readonly documents = new Map<string, DocumentData>();

  collection(path: string): FakeCollectionReference {
    return new FakeCollectionReference(this, path);
  }

  runTransaction<T>(
    updateFunction: (transaction: FakeTransaction) => Promise<T>,
  ): Promise<T> {
    return updateFunction(new FakeTransaction());
  }

  /** Mirrors Firestore#getAll(...refs): batched reads, snapshots in order. */
  getAll(...refs: FakeDocumentReference[]): Promise<FakeDocumentSnapshot[]> {
    return Promise.all(refs.map((ref) => ref.get()));
  }

  /** Raw document contents, for asserting exactly what was persisted. */
  read(path: string): DocumentData | undefined {
    const value = this.documents.get(path);

    return value ? { ...value } : undefined;
  }

  write(path: string, data: DocumentData, options: SetOptions = {}): void {
    const existing = options.merge ? this.documents.get(path) : undefined;

    this.documents.set(path, { ...existing, ...data });
  }

  remove(path: string): void {
    this.documents.delete(path);
  }

  paths(prefix: string): string[] {
    return [...this.documents.keys()].filter(
      (path) =>
        path.startsWith(`${prefix}/`) &&
        !path.slice(prefix.length + 1).includes("/"),
    );
  }

  asFirestore(): Firestore {
    return this as unknown as Firestore;
  }
}

export class FakeDocumentSnapshot {
  constructor(
    readonly id: string,
    private readonly value: DocumentData | undefined,
  ) {}

  get exists(): boolean {
    return this.value !== undefined;
  }

  data(): DocumentData | undefined {
    return this.value ? { ...this.value } : undefined;
  }
}

export class FakeDocumentReference {
  constructor(
    readonly firestore: FakeFirestore,
    readonly path: string,
    readonly id: string,
  ) {}

  collection(name: string): FakeCollectionReference {
    return new FakeCollectionReference(this.firestore, `${this.path}/${name}`);
  }

  get(): Promise<FakeDocumentSnapshot> {
    return Promise.resolve(
      new FakeDocumentSnapshot(this.id, this.firestore.read(this.path)),
    );
  }

  set(data: DocumentData, options: SetOptions = {}): Promise<void> {
    this.firestore.write(this.path, data, options);

    return Promise.resolve();
  }

  update(data: DocumentData): Promise<void> {
    if (this.firestore.read(this.path) === undefined) {
      return Promise.reject(new Error(`No document to update: ${this.path}`));
    }

    this.firestore.write(this.path, data, { merge: true });

    return Promise.resolve();
  }

  delete(): Promise<void> {
    this.firestore.remove(this.path);

    return Promise.resolve();
  }
}

export class FakeCollectionReference {
  constructor(
    readonly firestore: FakeFirestore,
    private readonly path: string,
  ) {}

  doc(id: string): FakeDocumentReference {
    return new FakeDocumentReference(this.firestore, `${this.path}/${id}`, id);
  }

  limit(count: number): {
    get: () => Promise<{ docs: FakeDocumentSnapshot[] }>;
  } {
    return {
      get: async () => {
        const { docs } = await this.get();

        return { docs: docs.slice(0, count) };
      },
    };
  }

  get(): Promise<{ docs: FakeDocumentSnapshot[] }> {
    const docs = this.firestore.paths(this.path).map((documentPath) => {
      const id = documentPath.slice(this.path.length + 1);

      return new FakeDocumentSnapshot(id, this.firestore.read(documentPath));
    });

    return Promise.resolve({ docs });
  }

  where(field: string, operator: "==", value: unknown): FakeQuery {
    return new FakeQuery(this.firestore, this.path, [
      (data) => data?.[field] === value,
    ]);
  }

  count(): FakeAggregateQuery {
    return new FakeQuery(this.firestore, this.path, []).count();
  }
}

export class FakeQuery {
  constructor(
    private readonly firestore: FakeFirestore,
    private readonly path: string,
    private readonly predicates: Array<
      (data: DocumentData | undefined) => boolean
    >,
  ) {}

  where(field: string, operator: "==", value: unknown): FakeQuery {
    return new FakeQuery(this.firestore, this.path, [
      ...this.predicates,
      (data) => data?.[field] === value,
    ]);
  }

  get(): Promise<{ docs: FakeDocumentSnapshot[] }> {
    const docs = this.firestore
      .paths(this.path)
      .map((documentPath) => {
        const id = documentPath.slice(this.path.length + 1);

        return new FakeDocumentSnapshot(id, this.firestore.read(documentPath));
      })
      .filter((doc) => this.predicates.every((matches) => matches(doc.data())));

    return Promise.resolve({ docs });
  }

  count(): FakeAggregateQuery {
    return {
      get: async () => {
        const { docs } = await this.get();

        return { data: () => ({ count: docs.length }) };
      },
    };
  }
}

export type FakeAggregateQuery = {
  get: () => Promise<{ data: () => { count: number } }>;
};

export class FakeTransaction {
  get(reference: FakeDocumentReference): Promise<FakeDocumentSnapshot>;
  get(reference: FakeCollectionReference): Promise<{ docs: FakeDocumentSnapshot[] }>;
  get(reference: FakeAggregateQuery): Promise<{ data: () => { count: number } }>;
  get(
    reference:
      | FakeDocumentReference
      | FakeCollectionReference
      | FakeAggregateQuery,
  ): Promise<
    | FakeDocumentSnapshot
    | { docs: FakeDocumentSnapshot[] }
    | { data: () => { count: number } }
  > {
    return reference.get();
  }

  set(
    reference: FakeDocumentReference,
    data: DocumentData,
    options: SetOptions = {},
  ): void {
    void reference.set(data, options);
  }

  update(reference: FakeDocumentReference, data: DocumentData): void {
    reference.firestore.write(reference.path, data, { merge: true });
  }

  delete(reference: FakeDocumentReference): void {
    void reference.delete();
  }
}
