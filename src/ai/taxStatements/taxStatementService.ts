import { HttpReplyError } from "../../utils/httpReplyError";
import { loadTaxStatementContext } from "./taxStatementSources";
import { parseStatementYear } from "./taxStatementPeriod";
import {
  isTaxStatementIncomeType,
  type TaxStatementIncomeType,
  type TaxStatementResult,
} from "./taxStatementTypes";
import { buildPayeeTaxStatement } from "./builders/payeeTaxStatement";
import { buildRemoteWorkerTaxStatement } from "./builders/remoteWorkerTaxStatement";
import { buildGigWorkerTaxStatement } from "./builders/gigWorkerTaxStatement";
import { buildTraderTaxStatement } from "./builders/traderTaxStatement";
import { buildSolopreneurTaxStatement } from "./builders/solopreneurTaxStatement";

export async function getTaxStatement(
  userId: string,
  incomeTypeRaw: string | undefined,
  yearRaw: unknown,
): Promise<TaxStatementResult> {
  const incomeType = String(incomeTypeRaw ?? "").trim().toUpperCase();
  if (!isTaxStatementIncomeType(incomeType)) {
    throw new HttpReplyError(
      400,
      "incomeType must be one of: PAYEE, REMOTE_WORKER, GIG_WORKER, TRADER, SOLOPRENEUR",
    );
  }
  const year = parseStatementYear(yearRaw);
  const ctx = await loadTaxStatementContext(userId, year);
  return dispatch(incomeType, ctx);
}

function dispatch(
  incomeType: TaxStatementIncomeType,
  ctx: Awaited<ReturnType<typeof loadTaxStatementContext>>,
): TaxStatementResult {
  switch (incomeType) {
    case "PAYEE":
      return buildPayeeTaxStatement(ctx);
    case "REMOTE_WORKER":
      return buildRemoteWorkerTaxStatement(ctx);
    case "GIG_WORKER":
      return buildGigWorkerTaxStatement(ctx);
    case "TRADER":
      return buildTraderTaxStatement(ctx);
    case "SOLOPRENEUR":
      return buildSolopreneurTaxStatement(ctx);
    default:
      throw new HttpReplyError(400, "Unsupported incomeType");
  }
}
