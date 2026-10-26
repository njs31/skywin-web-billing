import assert from "node:assert/strict";
import test from "node:test";
import { mergeReceiptBills, type ReceiptBill } from "./receipt-edit";

const openBill: ReceiptBill = {
  id: 10,
  invoiceNo: "SKYA/0010/26-27",
  date: "2026-10-01",
  grandTotal: "1000.00",
  paidAmount: "400.00",
  balance: "600.00",
};

test("a fully paid invoice stays on the edit form with this receipt's share", () => {
  const bills = mergeReceiptBills(
    [],
    [
      {
        id: 10,
        invoiceNo: "SKYA/0010/26-27",
        date: "2026-10-01",
        amount: "1000.00",
      },
    ]
  );
  assert.equal(bills.length, 1);
  assert.equal(bills[0]?.balance, "1000.00");
  assert.equal(bills[0]?.invoiceNo, "SKYA/0010/26-27");
});

test("a partial invoice's editable balance includes this receipt's share", () => {
  const bills = mergeReceiptBills([openBill], [
    {
      id: 10,
      invoiceNo: "SKYA/0010/26-27",
      date: "2026-10-01",
      amount: "400.00",
    },
  ]);
  assert.equal(bills.length, 1);
  assert.equal(bills[0]?.balance, "1000.00");
  assert.equal(bills[0]?.grandTotal, "1000.00");
});

test("other outstanding invoices are left unchanged", () => {
  const other: ReceiptBill = {
    id: 11,
    invoiceNo: "SKYA/0011/26-27",
    date: "2026-10-02",
    grandTotal: "250.00",
    paidAmount: "0.00",
    balance: "250.00",
  };
  const bills = mergeReceiptBills([openBill, other], [
    {
      id: 10,
      invoiceNo: "SKYA/0010/26-27",
      date: "2026-10-01",
      amount: "50.50",
    },
  ]);
  assert.deepEqual(
    bills.map((bill) => [bill.id, bill.balance]),
    [
      [10, "650.50"],
      [11, "250.00"],
    ]
  );
});
