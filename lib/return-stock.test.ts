import test from "node:test";
import assert from "node:assert/strict";
import {
  clientSafeReturnError,
  isSaleReturnStockMovement,
  saleCancellationStockNote,
  saleEditRestoreStockNote,
} from "./return-stock";

test("sale return reversal ignores other documents that share the id", () => {
  assert.equal(
    isSaleReturnStockMovement({ notes: "damaged", qtyDelta: "1.00" }),
    true
  );
  assert.equal(
    isSaleReturnStockMovement({ notes: null, qtyDelta: "1.00" }),
    true
  );
  assert.equal(
    isSaleReturnStockMovement({
      notes: saleEditRestoreStockNote("SW/0042/26-27"),
      qtyDelta: "1.00",
    }),
    false
  );
  assert.equal(
    isSaleReturnStockMovement({
      notes: saleCancellationStockNote("SW/0042/26-27"),
      qtyDelta: "2.00",
    }),
    false
  );
  assert.equal(
    isSaleReturnStockMovement({
      notes: "Debit Note: Supplier Return",
      qtyDelta: "-1.00",
    }),
    false
  );
});

test("edit errors stay readable instead of the production digest", () => {
  assert.equal(
    clientSafeReturnError(
      new Error(
        "Can't update this credit note because that returned stock has already been sold. Insufficient stock for FALCON. Available: 0, requested: 1"
      )
    ),
    "Can't update this credit note because that returned stock has already been sold. Insufficient stock for FALCON. Available: 0, requested: 1"
  );

  const wrapped = new Error(
    'Failed query: select * from "stock_movements"',
    {
      cause: new Error(
        "Insufficient stock for FALCON ELECTRIC CHAINSAW FECS 149. Available: 0, requested: 1"
      ),
    }
  );
  assert.match(clientSafeReturnError(wrapped), /Insufficient stock for FALCON/);

  assert.equal(
    clientSafeReturnError(Object.assign(new Error("[]"), { name: "ZodError" })),
    "Could not save this return. Check the quantities and try again."
  );

  assert.equal(
    clientSafeReturnError(
      new Error(
        "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details."
      )
    ),
    "Could not save this return. Nothing was changed."
  );
});
