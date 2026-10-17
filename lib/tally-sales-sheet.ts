/** One sales line on the Tally Integration Export "sales" sheet. Key order is the Excel column order. */
export function buildSalesTallyRow(input: {
  date: string;
  invoiceNo: string;
  partyName: string;
  paymentMode: string;
  itemName: string;
  itemCode: string;
  hsn: string;
  category: string;
  description: string;
  challan: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxPercent: number;
  taxabilityType: string;
  tax: number;
  amount: number;
  cgst: number;
  taxableAmount: number;
  sgst: number;
  netAmount: number;
  salesLedger: string;
  gstNo: string;
  gstType: string;
  state: string;
  billedTo: string;
}) {
  return {
    Date: input.date,
    "Invoice No./Txn No.": input.invoiceNo,
    "Party Name": input.partyName,
    "Mode of Payment": input.paymentMode,
    "Item Name": input.itemName,
    "Item Code": input.itemCode,
    "HSN/SAC": input.hsn,
    LOCATION: "",
    Category: input.category,
    Description: input.description,
    "Challan/Order No.": input.challan,
    Quantity: input.quantity,
    Unit: input.unit,
    UnitPrice: input.unitPrice,
    "Tax Percent": input.taxPercent,
    "Taxability type": input.taxabilityType,
    Tax: input.tax,
    "Transaction Type": "Sale ",
    Amount: input.amount,
    cgst: input.cgst,
    "taxable amount": input.taxableAmount,
    sgst: input.sgst,
    "net amount": input.netAmount,
    "sales ledger": input.salesLedger,
    "GST NO.": input.gstNo,
    "Gst type": input.gstType,
    STATE: input.state,
    COUNTRY: "India",
    "BILLED TO ADDRESS": input.billedTo,
    "SHIPPED TO ADDRESS": input.billedTo,
  };
}
