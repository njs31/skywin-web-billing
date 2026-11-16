import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, products, reportingLines, saleItems, sales, users } from "@/db/schema";
import { fieldSaleWhere, waybillFromNotes } from "@/lib/queries/field-orders";
import { teamOrderOfficerId, teamOrderStatus, type TeamOrderStatus } from "@/lib/sales-team-status";
import { toNumber } from "@/lib/utils";

export type SalesTeamOfficer = {
  id: number;
  name: string;
  phone: string;
  farmers: number;
  orders: number;
  todayOrders: number;
  amount: number;
};

export type SalesTeamOrder = {
  id: number;
  invoiceNo: string;
  date: Date;
  farmer: string;
  officerId: number | null;
  officerName: string;
  amount: number;
  paymentMode: string;
  status: TeamOrderStatus;
  lines: { name: string; qty: number; amount: number }[];
};

export type SalesTeamDashboard = {
  officers: SalesTeamOfficer[];
  orders: SalesTeamOrder[];
  farmerCount: number;
  orderCount: number;
  amount: number;
  statusCounts: Record<TeamOrderStatus, number>;
};

const EMPTY_STATUS: Record<TeamOrderStatus, number> = {
  Paid: 0,
  Shipped: 0,
  Cancelled: 0,
  Refunded: 0,
  "Partly refunded": 0,
};

export async function salesTeamDashboard(managerId: number): Promise<SalesTeamDashboard> {
  const officers = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(reportingLines)
    .innerJoin(users, eq(reportingLines.officerId, users.id))
    .where(eq(reportingLines.managerId, managerId))
    .orderBy(asc(users.name), asc(users.id));

  if (officers.length === 0) {
    return {
      officers: [],
      orders: [],
      farmerCount: 0,
      orderCount: 0,
      amount: 0,
      statusCounts: { ...EMPTY_STATUS },
    };
  }

  const officerIds = officers.map((officer) => officer.id);
  const farmerRows = await db
    .select({
      officerId: customers.assignedOfficerId,
      count: sql<number>`count(*)::int`,
    })
    .from(customers)
    .where(and(eq(customers.type, "farmer"), inArray(customers.assignedOfficerId, officerIds)))
    .groupBy(customers.assignedOfficerId);
  const farmersByOfficer = new Map(farmerRows.map((row) => [row.officerId, Number(row.count)]));

  const operatorNames = officers.map((officer) => `Field · ${officer.name}`);
  const saleRows = await db
    .select({
      id: sales.id,
      invoiceNo: sales.invoiceNo,
      date: sales.date,
      operatorName: sales.operatorName,
      customerName: sales.customerName,
      assignedOfficerId: customers.assignedOfficerId,
      paymentMode: sales.paymentMode,
      grandTotal: sales.grandTotal,
      refundedAmount: sales.refundedAmount,
      status: sales.status,
      notes: sales.notes,
    })
    .from(sales)
    .leftJoin(customers, eq(customers.id, sales.customerId))
    .where(
      and(
        fieldSaleWhere(),
        or(inArray(customers.assignedOfficerId, officerIds), inArray(sales.operatorName, operatorNames))
      )
    )
    .orderBy(desc(sales.date), desc(sales.id));

  const saleIds = saleRows.map((row) => row.id);
  const itemRows =
    saleIds.length === 0
      ? []
      : await db
          .select({
            saleId: saleItems.saleId,
            name: products.name,
            customName: saleItems.customName,
            qty: saleItems.qty,
            amount: saleItems.amount,
          })
          .from(saleItems)
          .leftJoin(products, eq(products.id, saleItems.productId))
          .where(inArray(saleItems.saleId, saleIds));
  const linesBySale = new Map<number, SalesTeamOrder["lines"]>();
  for (const item of itemRows) {
    const list = linesBySale.get(item.saleId) ?? [];
    list.push({
      name: item.customName || item.name || "Item",
      qty: toNumber(item.qty),
      amount: toNumber(item.amount),
    });
    linesBySale.set(item.saleId, list);
  }

  const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const orders: SalesTeamOrder[] = [];
  const perOfficer = new Map<number, { orders: number; today: number; amount: number }>();
  const statusCounts = { ...EMPTY_STATUS };
  let amount = 0;

  for (const row of saleRows) {
    const officerId = teamOrderOfficerId(officers, row);
    if (!officerId) continue;
    const total = toNumber(row.grandTotal);
    const refunded = toNumber(row.refundedAmount);
    const status = teamOrderStatus({
      status: row.status,
      refunded,
      total,
      waybill: waybillFromNotes(row.notes) || "",
    });
    statusCounts[status] += 1;
    if (status !== "Cancelled") amount += total;
    const bucket = perOfficer.get(officerId) ?? { orders: 0, today: 0, amount: 0 };
    bucket.orders += 1;
    if (status !== "Cancelled") bucket.amount += total;
    const day = row.date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (day === todayKey) bucket.today += 1;
    perOfficer.set(officerId, bucket);
    orders.push({
      id: row.id,
      invoiceNo: row.invoiceNo,
      date: row.date,
      farmer: row.customerName || "—",
      officerId,
      officerName: officers.find((officer) => officer.id === officerId)?.name || "—",
      amount: total,
      paymentMode: row.paymentMode,
      status,
      lines: linesBySale.get(row.id) ?? [],
    });
  }

  return {
    officers: officers.map((officer) => {
      const stats = perOfficer.get(officer.id);
      return {
        id: officer.id,
        name: officer.name,
        phone: officer.phone,
        farmers: farmersByOfficer.get(officer.id) ?? 0,
        orders: stats?.orders ?? 0,
        todayOrders: stats?.today ?? 0,
        amount: stats?.amount ?? 0,
      };
    }),
    orders,
    farmerCount: [...farmersByOfficer.values()].reduce((sum, count) => sum + count, 0),
    orderCount: orders.length,
    amount,
    statusCounts,
  };
}
