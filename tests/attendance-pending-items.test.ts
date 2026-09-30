import assert from "node:assert/strict";
import test from "node:test";
import { attendancePendingItems, pendingItemsInCart } from "../src/lib/attendance-pending-items";

test("partial checkout clears only the pending units present in the cart", () => {
  const pending = [{ id: "a", catalogId: "product", quantity: 1 }, { id: "b", catalogId: "product", quantity: 1 }, { id: "c", catalogId: "service:1", quantity: 1 }];
  assert.deepEqual(pendingItemsInCart(pending, [{ variantId: "product", quantity: 1 }]), ["a"]);
  assert.deepEqual(pendingItemsInCart(pending, [{ variantId: "product", quantity: 3 }, { variantId: "service:1", quantity: 1 }]), ["a", "b", "c"]);
  assert.deepEqual(pendingItemsInCart(pending, []), []);
});

test("legacy attendance metadata has no pending purchases", () => {
  assert.deepEqual(attendancePendingItems(null), []);
  assert.deepEqual(attendancePendingItems({ primaryProcedureRemoved: true }), []);
});
