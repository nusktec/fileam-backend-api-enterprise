import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { PaginationRequest } from "../../middlewares/paginationMiddleware";
import { HttpReplyError } from "../../utils/httpReplyError";
import { inventoryService } from "../services/inventoryService";
import { resolveCustomerFields } from "../../utils/directoryResolver";

export const getInventoryOverview = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await inventoryService.overview(userId);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Inventory overview", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load inventory overview", null));
  }
};

export const getInventoryAlerts = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await inventoryService.alerts(userId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Inventory alerts", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load inventory alerts", null));
  }
};

export const listInventoryMovements = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const inventoryItemId = req.query.inventoryItemId as string | undefined;
    const data = await inventoryService.listMovements(userId, {
      page: p?.page,
      limit: p?.limit,
      inventoryItemId: inventoryItemId?.trim() || undefined,
      dateFrom: p?.dateFrom,
      dateTo: p?.dateTo,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Inventory movements", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list movements", null));
  }
};

export const listInventorySales = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const data = await inventoryService.listSales(userId, {
      page: p?.page,
      limit: p?.limit,
      dateFrom: p?.dateFrom,
      dateTo: p?.dateTo,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "Inventory sales", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list inventory sales", null));
  }
};

export const sellFromInventory = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      lines: Array<{ inventoryItemId: string; quantity: number }>;
      customerName?: string;
      customerId?: string;
      createSalesInvoice?: boolean;
      paymentType?: string;
      saleDate?: string;
      invoiceDueDate?: string | null;
      vatableIncome?: boolean;
      vatInclusive?: boolean;
      serviceIncome?: boolean;
      saleCategory?: string;
    };
    const customerFields = await resolveCustomerFields(userId, req.body ?? {});
    const sale = await inventoryService.sellFromInventory(userId, {
      lines: data.lines.map((l) => ({
        inventoryItemId: l.inventoryItemId,
        quantity: Number(l.quantity),
      })),
      customerName: customerFields.customerName ?? undefined,
      customerId: customerFields.customerId ?? undefined,
      createSalesInvoice: data.createSalesInvoice,
      paymentType: data.paymentType,
      saleDate: data.saleDate,
      invoiceDueDate: data.invoiceDueDate,
      vatableIncome: data.vatableIncome,
      vatInclusive: data.vatInclusive,
      serviceIncome: data.serviceIncome,
      saleCategory: data.saleCategory,
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Sale recorded", sale));
  } catch (e: unknown) {
    if (e instanceof HttpReplyError) {
      res.status(e.statusCode).json(outJson(false, e.message, null));
      return;
    }
    const msg = e instanceof Error ? e.message : "Failed to record sale";
    if (
      msg.includes("not found") ||
      msg.includes("Insufficient") ||
      msg.includes("lines required") ||
      msg.includes("must be positive") ||
      msg === "User not found"
    ) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, msg, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to record sale", null));
  }
};

export const addInventoryItem = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      name: string;
      category: string;
      purchaseCost: number;
      sellingPrice: number;
      openingQuantity: number;
      lowStockAlertLevel: number;
      supplierName?: string;
      supplierId?: string;
    };
    const detail = await inventoryService.addItem(userId, {
      name: data.name,
      category: data.category,
      purchaseCost: Number(data.purchaseCost),
      sellingPrice: Number(data.sellingPrice),
      openingQuantity: Number(data.openingQuantity),
      lowStockAlertLevel: Number(data.lowStockAlertLevel),
      supplierName: data.supplierName,
      supplierId: data.supplierId,
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Inventory item created", detail));
  } catch (e: unknown) {
    if (e instanceof HttpReplyError) {
      res.status(e.statusCode).json(outJson(false, e.message, null));
      return;
    }
    const msg = e instanceof Error ? e.message : "Failed to create item";
    if (msg.includes("openingQuantity")) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, msg, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to create inventory item", null));
  }
};

export const listInventoryItems = async (
  req: IRequest & PaginationRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const p = req.pagination;
    const category = req.query.category as string | undefined;
    const lowStockOnly =
      String(req.query.lowStockOnly ?? "").toLowerCase() === "true" ||
      req.query.lowStockOnly === "1";
    const data = await inventoryService.listItems(userId, {
      page: p?.page,
      limit: p?.limit,
      category,
      lowStockOnly,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "Inventory items", data));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to list inventory items", null));
  }
};

export const getInventoryItemDetail = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const detail = await inventoryService.getItemDetail(userId, id!);
    if (!detail) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Inventory item not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Inventory item detail", detail));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to load item", null));
  }
};

export const restockInventoryItem = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as { quantity: number; note?: string };
    const detail = await inventoryService.restock(userId, id!, {
      quantity: Number(data.quantity),
      note: data.note,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Stock restocked", detail));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to restock";
    if (msg === "Inventory item not found") {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, msg, null));
      return;
    }
    if (msg.includes("quantity")) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, msg, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to restock", null));
  }
};

export const adjustInventoryItem = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as {
      direction: "in" | "out";
      quantity: number;
      note?: string;
      createSalesInvoice?: boolean;
      paymentType?: string;
      saleDate?: string;
      invoiceDueDate?: string | null;
      vatableIncome?: boolean;
      vatInclusive?: boolean;
      serviceIncome?: boolean;
      saleCategory?: string;
      expenseCategory?: string;
    };
    const detail = await inventoryService.adjustment(userId, id!, {
      direction: data.direction,
      quantity: Number(data.quantity),
      note: data.note,
      createSalesInvoice: data.createSalesInvoice,
      paymentType: data.paymentType,
      saleDate: data.saleDate,
      invoiceDueDate: data.invoiceDueDate,
      vatableIncome: data.vatableIncome,
      vatInclusive: data.vatInclusive,
      serviceIncome: data.serviceIncome,
      saleCategory: data.saleCategory,
      expenseCategory: data.expenseCategory,
    });
    if (!detail) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Inventory item not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Stock adjusted", detail));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to adjust stock";
    if (msg === "Inventory item not found") {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, msg, null));
      return;
    }
    if (
      msg.includes("quantity") ||
      msg.includes("direction") ||
      msg.includes("Insufficient") ||
      msg === "User not found"
    ) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, msg, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to adjust stock", null));
  }
};

export const updateInventoryItem = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Record<string, unknown>;
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const detail = await inventoryService.updateItem(userId, id!, {
      name: data.name as string | undefined,
      category: data.category as string | undefined,
      purchaseCost:
        data.purchaseCost != null ? Number(data.purchaseCost) : undefined,
      sellingPrice:
        data.sellingPrice != null ? Number(data.sellingPrice) : undefined,
      lowStockAlertLevel:
        data.lowStockAlertLevel != null
          ? Number(data.lowStockAlertLevel)
          : undefined,
      supplierName:
        data.supplierName !== undefined
          ? (data.supplierName as string | null)
          : undefined,
      supplierId:
        data.supplierId !== undefined
          ? (data.supplierId as string | null)
          : undefined,
    });
    if (!detail) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Inventory item not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Inventory item updated", detail));
  } catch (e: unknown) {
    if (e instanceof HttpReplyError) {
      res.status(e.statusCode).json(outJson(false, e.message, null));
      return;
    }
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update inventory item", null));
  }
};

export const deleteInventoryItem = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const result = await inventoryService.deleteItem(userId, id!);
    if (result === "not_found") {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Inventory item not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Inventory item deleted", null));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to delete inventory item", null));
  }
};
