import { body } from "express-validator";
import {
  EXPENSE_UNDO_REASONS,
  SALE_UNDO_REASONS,
  ASSET_UNDO_REASONS,
  ASSET_SALE_UNDO_REASONS,
  ASSET_DISPOSAL_UNDO_REASONS,
  ASSET_TRANSFER_UNDO_REASONS,
  ASSET_CASH_UNDO_REASONS,
  ASSET_BANK_UNDO_REASONS,
  ASSET_RECEIVABLE_UNDO_REASONS,
  UNIT_ATTRIBUTION_UNDO_REASONS,
  UNIT_ATTRIBUTION_RECORD_UNDO_REASONS,
  PAYER_UNDO_REASONS,
  PAYER_TRANSACTION_UNDO_REASONS,
  BENEFICIARY_UNDO_REASONS,
  BENEFICIARY_TRANSACTION_UNDO_REASONS,
} from "../../constants/recordUndo";
import { handleValidation } from "../errorHandler";

function undoReasonValidation(reasons: readonly string[]) {
  return [
    body("reason")
      .trim()
      .notEmpty()
      .withMessage("reason is required")
      .isIn([...reasons])
      .withMessage(`reason must be one of: ${reasons.join(", ")}`),
    handleValidation,
  ];
}

export const saleUndoValidation = undoReasonValidation(SALE_UNDO_REASONS);

export const expenseUndoValidation = undoReasonValidation(EXPENSE_UNDO_REASONS);

export const assetUndoValidation = undoReasonValidation(ASSET_UNDO_REASONS);

export const assetSaleUndoValidation = undoReasonValidation(ASSET_SALE_UNDO_REASONS);

export const assetDisposalUndoValidation = undoReasonValidation(
  ASSET_DISPOSAL_UNDO_REASONS,
);

export const assetTransferUndoValidation = undoReasonValidation(
  ASSET_TRANSFER_UNDO_REASONS,
);

export const assetCashUndoValidation = undoReasonValidation(
  ASSET_CASH_UNDO_REASONS,
);

export const assetBankUndoValidation = undoReasonValidation(
  ASSET_BANK_UNDO_REASONS,
);

export const assetReceivableUndoValidation = undoReasonValidation(
  ASSET_RECEIVABLE_UNDO_REASONS,
);

export const unitAttributionUndoValidation = undoReasonValidation(
  UNIT_ATTRIBUTION_UNDO_REASONS,
);

export const unitAttributionRecordUndoValidation = undoReasonValidation(
  UNIT_ATTRIBUTION_RECORD_UNDO_REASONS,
);

export const payerUndoValidation = undoReasonValidation(PAYER_UNDO_REASONS);

export const payerTransactionUndoValidation = undoReasonValidation(
  PAYER_TRANSACTION_UNDO_REASONS,
);

export const beneficiaryUndoValidation = undoReasonValidation(
  BENEFICIARY_UNDO_REASONS,
);

export const beneficiaryTransactionUndoValidation = undoReasonValidation(
  BENEFICIARY_TRANSACTION_UNDO_REASONS,
);
