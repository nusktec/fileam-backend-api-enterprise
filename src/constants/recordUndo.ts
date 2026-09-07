/** Record undo statuses per Sale/Expense/Liability undo API specs. */
export const RECORD_UNDO_STATUS = {
  VOIDED: "voided",
  REVERSED: "reversed",
} as const;

export type RecordUndoStatus =
  (typeof RECORD_UNDO_STATUS)[keyof typeof RECORD_UNDO_STATUS];

export const RECORD_UNDO_ACTION = {
  VOID: "void",
  REVERSE: "reverse",
} as const;

export type RecordUndoAction =
  (typeof RECORD_UNDO_ACTION)[keyof typeof RECORD_UNDO_ACTION];

export const SALE_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate sale",
  "Wrong amount",
  "Wrong customer",
  "Wrong product",
  "Wrong date",
  "Sale cancelled",
  "Other",
] as const;

export type SaleUndoReason = (typeof SALE_UNDO_REASONS)[number];

export const EXPENSE_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate expense",
  "Wrong amount",
  "Wrong expense category",
  "Wrong supplier",
  "Wrong date",
  "Expense cancelled",
  "Other",
] as const;

export type ExpenseUndoReason = (typeof EXPENSE_UNDO_REASONS)[number];

export const INVENTORY_SALE_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate sale",
  "Wrong quantity",
  "Wrong customer",
  "Wrong product",
  "Wrong date",
  "Sale cancelled",
  "Other",
] as const;

export const LIABILITY_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate liability",
  "Wrong amount",
  "Wrong creditor",
  "Wrong date",
  "Not a business liability",
  "Other",
] as const;

export const LIABILITY_REPAYMENT_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate repayment",
  "Wrong amount",
  "Wrong liability",
  "Wrong date",
  "Other",
] as const;

export const ASSET_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate asset",
  "Wrong amount",
  "Wrong asset",
  "Wrong date",
  "Not a business asset",
  "Other",
] as const;

export type AssetUndoReason = (typeof ASSET_UNDO_REASONS)[number];

export const ASSET_SALE_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate sale",
  "Wrong amount",
  "Wrong buyer",
  "Wrong asset",
  "Wrong date",
  "Sale cancelled",
  "Other",
] as const;

export type AssetSaleUndoReason = (typeof ASSET_SALE_UNDO_REASONS)[number];

export const ASSET_DISPOSAL_UNDO_REASONS = [
  "Created by mistake",
  "Wrong asset",
  "Wrong reason",
  "Wrong date",
  "Asset was not lost",
  "Other",
] as const;

export type AssetDisposalUndoReason =
  (typeof ASSET_DISPOSAL_UNDO_REASONS)[number];

export const ASSET_TRANSFER_UNDO_REASONS = [
  "Created by mistake",
  "Wrong location",
  "Wrong employee",
  "Wrong date",
  "Transfer cancelled",
  "Other",
] as const;

export type AssetTransferUndoReason =
  (typeof ASSET_TRANSFER_UNDO_REASONS)[number];

export const PAYER_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate payer",
  "Wrong details",
  "Other",
] as const;

export type PayerUndoReason = (typeof PAYER_UNDO_REASONS)[number];

export const PAYER_TRANSACTION_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate transaction",
  "Wrong amount",
  "Wrong payer",
  "Wrong date",
  "Invoice cancelled",
  "Other",
] as const;

export type PayerTransactionUndoReason =
  (typeof PAYER_TRANSACTION_UNDO_REASONS)[number];

export const BENEFICIARY_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate beneficiary",
  "Wrong details",
  "Other",
] as const;

export type BeneficiaryUndoReason = (typeof BENEFICIARY_UNDO_REASONS)[number];

export const BENEFICIARY_TRANSACTION_UNDO_REASONS = [
  "Created by mistake",
  "Duplicate transaction",
  "Wrong amount",
  "Wrong beneficiary",
  "Wrong date",
  "Invoice cancelled",
  "Other",
] as const;

export type BeneficiaryTransactionUndoReason =
  (typeof BENEFICIARY_TRANSACTION_UNDO_REASONS)[number];

/** Live list tabs — exclude voided/reversed rows. */
export const LIVE_SALE_STATUSES = [
  "PAID",
  "Paid",
  "Pending",
  "Partial",
  "Overdue",
  "IN_PROGRESS",
  "CANCELLED",
] as const;

export function isUndoneStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return (
    s === RECORD_UNDO_STATUS.VOIDED ||
    s === RECORD_UNDO_STATUS.REVERSED ||
    s === "void"
  );
}

/** API-facing transaction status (legacy VOID → voided). */
export function normalizeUndoTxnStatus(status: string): string {
  if (status === "VOID") return RECORD_UNDO_STATUS.VOIDED;
  return status;
}

export function undoStatusFromAction(
  action: RecordUndoAction,
): RecordUndoStatus {
  return action === RECORD_UNDO_ACTION.VOID
    ? RECORD_UNDO_STATUS.VOIDED
    : RECORD_UNDO_STATUS.REVERSED;
}

/** Registered liability undo lifecycle (recordStatus column). */
export const LIABILITY_RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  VOIDED: "voided",
  REVERSED: "reversed",
} as const;

export type LiabilityRecordStatus =
  (typeof LIABILITY_RECORD_STATUS)[keyof typeof LIABILITY_RECORD_STATUS];

/** Liability repayment undo lifecycle (recordStatus column). */
export const LIABILITY_REPAYMENT_RECORD_STATUS = {
  ACTIVE: "ACTIVE",
  REVERSED: "reversed",
} as const;

export function isActiveRecordStatus(
  recordStatus: string | null | undefined,
): boolean {
  const s = (recordStatus ?? LIABILITY_RECORD_STATUS.ACTIVE).toUpperCase();
  return s === LIABILITY_RECORD_STATUS.ACTIVE;
}

export function mapUndoPayload(row: {
  undoAt?: Date | null;
  undoReason?: string | null;
  reversingEntryId?: string | null;
  reversingEntryDate?: Date | null;
}) {
  if (!row.undoAt) return null;
  return {
    at: row.undoAt.toISOString(),
    reason: row.undoReason ?? null,
    reversingEntry: row.reversingEntryId
      ? {
          id: row.reversingEntryId,
          date: (row.reversingEntryDate ?? row.undoAt).toISOString().slice(0, 10),
        }
      : null,
  };
}
