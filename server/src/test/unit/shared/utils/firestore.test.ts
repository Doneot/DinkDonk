import { describe, expect, it } from "vitest";

import { getExistingDoc } from "../../../../shared/utils/firestore.js";
import { FakeFirestore } from "../../../helpers/fakeFirestore.js";

describe("getExistingDoc", () => {
  it("returns the document snapshot when it exists", async () => {
    const firestore = new FakeFirestore();

    firestore.write("things/thing-1", { name: "widget" });

    const collection = firestore.asFirestore().collection("things");
    const doc = await getExistingDoc(collection, "thing-1");

    expect(doc?.exists).toBe(true);
    expect(doc?.data()).toEqual({ name: "widget" });
  });

  it("returns null when the document does not exist", async () => {
    const firestore = new FakeFirestore();
    const collection = firestore.asFirestore().collection("things");

    await expect(getExistingDoc(collection, "missing")).resolves.toBeNull();
  });

  it.each(["", "   "])("returns null for the blank id %j", async (id) => {
    const firestore = new FakeFirestore();
    const collection = firestore.asFirestore().collection("things");

    await expect(getExistingDoc(collection, id)).resolves.toBeNull();
  });
});
