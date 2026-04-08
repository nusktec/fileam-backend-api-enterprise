/**
 * Dummy inventory for mobile / Postman demo users (consultant@fileam.app, client@fileam.app).
 * Idempotent: skips if the user already has any inventory_items.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../config/database";
import { INVENTORY_MOVEMENT_TYPES } from "../constants/inventory";

const dec = (n: number) => new Decimal(n);

type Op =
  | { kind: "restock"; qty: number; atDaysAgo: number; note?: string }
  | { kind: "adj_in"; qty: number; atDaysAgo: number; note?: string }
  | { kind: "adj_out"; qty: number; atDaysAgo: number; note?: string }
  | { kind: "sale"; qty: number; atDaysAgo: number; customer?: string };

interface ItemDef {
  name: string;
  category: string;
  cost: number;
  price: number;
  alert: number;
  supplier?: string;
  opening: number;
  openingAtDaysAgo: number;
  ops: Op[];
}

const ITEM_DEFS: ItemDef[] = [
  {
    name: "USB-C Hub 7-in-1",
    category: "Electronics",
    cost: 12500,
    price: 18900,
    alert: 8,
    supplier: "Sokoto Electronics Wholesale",
    opening: 40,
    openingAtDaysAgo: 95,
    ops: [
      { kind: "restock", qty: 30, atDaysAgo: 62 },
      { kind: "sale", qty: 5, atDaysAgo: 44, customer: "Walk-in" },
      { kind: "sale", qty: 8, atDaysAgo: 11, customer: "Lagos Hub Ltd" },
      { kind: "restock", qty: 20, atDaysAgo: 4 },
    ],
  },
  {
    name: "Ergonomic Wireless Mouse",
    category: "Electronics",
    cost: 4500,
    price: 8500,
    alert: 15,
    supplier: "Sokoto Electronics Wholesale",
    opening: 60,
    openingAtDaysAgo: 88,
    ops: [
      { kind: "sale", qty: 25, atDaysAgo: 55, customer: "Acme Retail" },
      { kind: "sale", qty: 18, atDaysAgo: 20, customer: "Walk-in" },
      { kind: "restock", qty: 40, atDaysAgo: 8 },
    ],
  },
  {
    name: "A4 Paper Ream (500 sheets)",
    category: "Office",
    cost: 3200,
    price: 4800,
    alert: 20,
    supplier: "PaperMart NG",
    opening: 200,
    openingAtDaysAgo: 120,
    ops: [
      { kind: "restock", qty: 100, atDaysAgo: 75 },
      { kind: "sale", qty: 40, atDaysAgo: 100, customer: "Internal use" },
      { kind: "adj_out", qty: 5, atDaysAgo: 30, note: "Damaged stock write-off" },
    ],
  },
  {
    name: "Branded T-Shirt (L)",
    category: "Fashion",
    cost: 2800,
    price: 6500,
    alert: 10,
    supplier: "Print & Stitch Lagos",
    opening: 50,
    openingAtDaysAgo: 70,
    ops: [
      { kind: "sale", qty: 12, atDaysAgo: 50, customer: "Corporate order" },
      { kind: "sale", qty: 30, atDaysAgo: 5, customer: "Weekend pop-up" },
    ],
  },
  {
    name: "Portable Power Bank 20Ah",
    category: "Electronics",
    cost: 8900,
    price: 14500,
    alert: 6,
    supplier: "Sokoto Electronics Wholesale",
    opening: 25,
    openingAtDaysAgo: 45,
    ops: [
      { kind: "restock", qty: 20, atDaysAgo: 35 },
      { kind: "sale", qty: 15, atDaysAgo: 22, customer: "Walk-in" },
      { kind: "sale", qty: 22, atDaysAgo: 3, customer: "Jumia pickup" },
    ],
  },
  {
    name: "Desk Organizer Set",
    category: "Office",
    cost: 5500,
    price: 9900,
    alert: 5,
    supplier: "Office Depot NG",
    opening: 15,
    openingAtDaysAgo: 100,
    ops: [
      { kind: "sale", qty: 4, atDaysAgo: 80, customer: "SME bundle" },
      { kind: "adj_in", qty: 2, atDaysAgo: 40, note: "Found in storage" },
    ],
  },
  {
    name: "Organic Honey 500g",
    category: "Groceries",
    cost: 2200,
    price: 3800,
    alert: 12,
    supplier: "FarmLink Cooperative",
    opening: 80,
    openingAtDaysAgo: 55,
    ops: [
      { kind: "sale", qty: 35, atDaysAgo: 40, customer: "Local market" },
      { kind: "restock", qty: 50, atDaysAgo: 18 },
      { kind: "sale", qty: 28, atDaysAgo: 6, customer: "Walk-in" },
    ],
  },
  {
    name: "LED Desk Lamp",
    category: "Electronics",
    cost: 6800,
    price: 11200,
    alert: 4,
    supplier: "Sokoto Electronics Wholesale",
    opening: 8,
    openingAtDaysAgo: 30,
    ops: [
      { kind: "restock", qty: 12, atDaysAgo: 20 },
      { kind: "sale", qty: 3, atDaysAgo: 14, customer: "Home office" },
    ],
  },
  {
    name: "Notebook Hardcover A5",
    category: "Office",
    cost: 900,
    price: 1800,
    alert: 25,
    supplier: "PaperMart NG",
    opening: 150,
    openingAtDaysAgo: 130,
    ops: [
      { kind: "sale", qty: 60, atDaysAgo: 95, customer: "School supply drive" },
      { kind: "sale", qty: 45, atDaysAgo: 25, customer: "Walk-in" },
    ],
  },
  {
    name: "Stainless Steel Flask 750ml",
    category: "Home",
    cost: 3500,
    price: 6200,
    alert: 8,
    supplier: "KitchenPro Importers",
    opening: 22,
    openingAtDaysAgo: 65,
    ops: [
      { kind: "sale", qty: 6, atDaysAgo: 50, customer: "Gift shop" },
      { kind: "adj_out", qty: 1, atDaysAgo: 42, note: "Display unit" },
      { kind: "restock", qty: 15, atDaysAgo: 10 },
    ],
  },
  {
    name: "Bluetooth Speaker Mini",
    category: "Electronics",
    cost: 11000,
    price: 17500,
    alert: 5,
    supplier: "Sokoto Electronics Wholesale",
    opening: 3,
    openingAtDaysAgo: 14,
    ops: [
      { kind: "restock", qty: 10, atDaysAgo: 9 },
      { kind: "sale", qty: 4, atDaysAgo: 2, customer: "Walk-in" },
    ],
  },
  {
    name: "Ballpoint Pens (box 50)",
    category: "Office",
    cost: 4500,
    price: 7200,
    alert: 3,
    supplier: "PaperMart NG",
    opening: 4,
    openingAtDaysAgo: 20,
    ops: [{ kind: "sale", qty: 2, atDaysAgo: 7, customer: "Corporate" }],
  },
];

function atDaysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return d;
}

/**
 * @returns true if seed data was inserted, false if user already had inventory
 */
export async function seedInventoryDummyDataForUser(userId: string): Promise<boolean> {
  const existing = await prisma.inventoryItem.count({ where: { userId } });
  if (existing > 0) return false;

  const now = new Date();
  const createdItemIds: string[] = [];

  for (const def of ITEM_DEFS) {
    await prisma.$transaction(async (tx) => {
      let q = def.opening;
      const item = await tx.inventoryItem.create({
        data: {
          userId,
          name: def.name,
          category: def.category,
          purchaseCost: dec(def.cost),
          sellingPrice: dec(def.price),
          quantity: dec(q),
          lowStockAlertLevel: dec(def.alert),
          supplierName: def.supplier ?? null,
          supplierId: null,
          lastSaleAt: null,
        },
      });
      createdItemIds.push(item.id);

      await tx.inventoryMovement.create({
        data: {
          userId,
          inventoryItemId: item.id,
          type: INVENTORY_MOVEMENT_TYPES.OPENING,
          quantityDelta: dec(q),
          quantityAfter: dec(q),
          createdAt: atDaysAgo(now, def.openingAtDaysAgo),
          note: "Opening stock",
        },
      });

      const sortedOps = [...def.ops].sort((a, b) => b.atDaysAgo - a.atDaysAgo);

      for (const op of sortedOps) {
        const createdAt = atDaysAgo(now, op.atDaysAgo);
        if (op.kind === "restock") {
          q += op.qty;
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: dec(q) },
          });
          await tx.inventoryMovement.create({
            data: {
              userId,
              inventoryItemId: item.id,
              type: INVENTORY_MOVEMENT_TYPES.RESTOCK,
              quantityDelta: dec(op.qty),
              quantityAfter: dec(q),
              createdAt,
              note: op.note ?? null,
            },
          });
        } else if (op.kind === "adj_in") {
          q += op.qty;
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: dec(q) },
          });
          await tx.inventoryMovement.create({
            data: {
              userId,
              inventoryItemId: item.id,
              type: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_IN,
              quantityDelta: dec(op.qty),
              quantityAfter: dec(q),
              createdAt,
              note: op.note ?? null,
            },
          });
        } else if (op.kind === "adj_out") {
          q -= op.qty;
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: dec(q) },
          });
          await tx.inventoryMovement.create({
            data: {
              userId,
              inventoryItemId: item.id,
              type: INVENTORY_MOVEMENT_TYPES.ADJUSTMENT_OUT,
              quantityDelta: dec(-op.qty),
              quantityAfter: dec(q),
              createdAt,
              note: op.note ?? null,
            },
          });
        } else if (op.kind === "sale") {
          q -= op.qty;
          const lineTotal = def.price * op.qty;
          const sale = await tx.inventorySale.create({
            data: {
              userId,
              soldAt: createdAt,
              totalAmount: dec(lineTotal),
              customerName: op.customer ?? "Customer",
              customerId: null,
              lines: {
                create: [
                  {
                    inventoryItemId: item.id,
                    quantity: dec(op.qty),
                    unitSellingPrice: dec(def.price),
                    unitCost: dec(def.cost),
                    lineTotal: dec(lineTotal),
                  },
                ],
              },
            },
          });
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: dec(q), lastSaleAt: createdAt },
          });
          await tx.inventoryMovement.create({
            data: {
              userId,
              inventoryItemId: item.id,
              type: INVENTORY_MOVEMENT_TYPES.SALE,
              quantityDelta: dec(-op.qty),
              quantityAfter: dec(q),
              inventorySaleId: sale.id,
              createdAt,
              note: "Inventory sale",
            },
          });
        }
      }
    });
  }

  // One multi-line sale (first two items) for mixed-basket reporting
  const [hubId, mouseId] = createdItemIds;
  if (hubId && mouseId) {
    const hubDef = ITEM_DEFS[0];
    const mouseDef = ITEM_DEFS[1];
    const hubQty = 2;
    const mouseQty = 3;
    const soldAt = atDaysAgo(now, 1);

    await prisma.$transaction(async (tx) => {
      const hubItem = await tx.inventoryItem.findUniqueOrThrow({ where: { id: hubId } });
      const mouseItem = await tx.inventoryItem.findUniqueOrThrow({ where: { id: mouseId } });
      const hubCur = hubItem.quantity.toNumber();
      const mouseCur = mouseItem.quantity.toNumber();
      if (hubCur < hubQty || mouseCur < mouseQty) return;

      const line1Total = hubDef.price * hubQty;
      const line2Total = mouseDef.price * mouseQty;
      const totalAmount = dec(line1Total + line2Total);

      const sale = await tx.inventorySale.create({
        data: {
          userId,
          soldAt,
          totalAmount,
          customerName: "Bundle buyer (seed)",
          customerId: null,
          lines: {
            create: [
              {
                inventoryItemId: hubId,
                quantity: dec(hubQty),
                unitSellingPrice: dec(hubDef.price),
                unitCost: dec(hubDef.cost),
                lineTotal: dec(line1Total),
              },
              {
                inventoryItemId: mouseId,
                quantity: dec(mouseQty),
                unitSellingPrice: dec(mouseDef.price),
                unitCost: dec(mouseDef.cost),
                lineTotal: dec(line2Total),
              },
            ],
          },
        },
      });

      const newHub = hubCur - hubQty;
      await tx.inventoryItem.update({
        where: { id: hubId },
        data: { quantity: dec(newHub), lastSaleAt: soldAt },
      });
      await tx.inventoryMovement.create({
        data: {
          userId,
          inventoryItemId: hubId,
          type: INVENTORY_MOVEMENT_TYPES.SALE,
          quantityDelta: dec(-hubQty),
          quantityAfter: dec(newHub),
          inventorySaleId: sale.id,
          createdAt: soldAt,
          note: "Inventory sale",
        },
      });

      const newMouse = mouseCur - mouseQty;
      await tx.inventoryItem.update({
        where: { id: mouseId },
        data: { quantity: dec(newMouse), lastSaleAt: soldAt },
      });
      await tx.inventoryMovement.create({
        data: {
          userId,
          inventoryItemId: mouseId,
          type: INVENTORY_MOVEMENT_TYPES.SALE,
          quantityDelta: dec(-mouseQty),
          quantityAfter: dec(newMouse),
          inventorySaleId: sale.id,
          createdAt: soldAt,
          note: "Inventory sale",
        },
      });
    });
  }

  return true;
}
