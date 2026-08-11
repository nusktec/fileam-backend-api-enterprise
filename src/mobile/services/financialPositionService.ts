import { ASSET_TYPES, type AssetType } from "../../constants/assets";
import { PERCENT, PERCENT_TWO_DECIMAL_ROUND } from "../../constants/percentages";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { assetsService } from "./assetsService";
import { liabilityService } from "./liabilityService";

/** Display names for Financial Position — must match Asset module categories. */
const NON_CURRENT_ASSET_LABELS: Record<AssetType, string> = {
  VEHICLE: "Vehicle",
  COMPUTER_IT: "Computer & IT",
  MACHINERY: "Machinery",
  FURNITURE: "Furniture",
  BUILDING: "Buildings",
  SOFTWARE_LICENSES: "Software Licences",
  LAND: "Land",
  OTHER_ASSET: "Others",
};

const CURRENT_LIABILITY_NAMES = [
  "Accounts Payable",
  "Tax Payable",
  "Salaries Payable",
  "Pension Payable",
  "NHF Payable",
  "Interest Payable",
  "Short-term Loans",
] as const;

/** Liability dashboard uses "Short-Term Loan"; FP correction uses "Short-term Loans". */
const LIABILITY_DASH_TO_FP_NAME: Record<string, string> = {
  "Short-Term Loan": "Short-term Loans",
};

const NON_CURRENT_LIABILITY_NAMES = [
  "Bank Loan",
  "Director Loan",
  "Shareholder Loan",
  "Mortgage",
  "Equipment Financing",
  "Lease Liability",
  "Convertible Loan",
  "Other Long-term Borrowings",
] as const;

function round2(n: number): number {
  return (
    Math.round(n * PERCENT_TWO_DECIMAL_ROUND) / PERCENT_TWO_DECIMAL_ROUND
  );
}

function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return round2((part / whole) * PERCENT);
}

function currentRatio(currentAssets: number, currentLiabilities: number): number {
  if (currentLiabilities <= 0) return 0;
  return round2(currentAssets / currentLiabilities);
}

function namedItem(name: string, amount: number) {
  return { name, amount: normalizeMoneyAmount(amount) };
}

export const financialPositionService = {
  async get(userId: string) {
    const [current, nonCurrent, liabDash] = await Promise.all([
      assetsService.getCurrentAssetsSnapshot(userId),
      assetsService.nonCurrentAssets(userId),
      liabilityService.getDashboard(userId),
    ]);

    const amountByAssetType = new Map<string, number>();
    for (const cat of nonCurrent.categories) {
      amountByAssetType.set(cat.assetType, cat.total);
    }

    const nonCurrentAssetItems = ASSET_TYPES.map((assetType) =>
      namedItem(
        NON_CURRENT_ASSET_LABELS[assetType],
        amountByAssetType.get(assetType) ?? 0,
      ),
    );

    const nonCurrentAssetsTotal = normalizeMoneyAmount(
      nonCurrent.netNonCurrentAssets ??
        nonCurrent.total ??
        nonCurrentAssetItems.reduce((s, i) => s + i.amount, 0),
    );
    const currentAssetsTotal = normalizeMoneyAmount(current.totalCurrentAssets);

    const currentAssetItems = [
      namedItem("Cash", current.cash.total),
      namedItem("Bank Balance", current.bankBalances.total),
      namedItem("Inventory", current.inventory.total),
      namedItem("Accounts Receivable", current.accountsReceivable.total),
    ];

    const liabAmountByName = new Map<string, number>();
    for (const c of liabDash.currentLiabilities) {
      const fpName = LIABILITY_DASH_TO_FP_NAME[c.name] ?? c.name;
      liabAmountByName.set(fpName, c.amount);
    }

    const currentLiabilityItems = CURRENT_LIABILITY_NAMES.map((name) =>
      namedItem(name, liabAmountByName.get(name) ?? 0),
    );
    const currentLiabilitiesTotal = normalizeMoneyAmount(
      liabDash.summary.currentLiability,
    );

    const nonCurrentLiabilityItems = NON_CURRENT_LIABILITY_NAMES.map((name) => {
      const hit = liabDash.nonCurrentLiabilities.find((c) => c.name === name);
      return namedItem(name, hit?.amount ?? 0);
    });
    const nonCurrentLiabilitiesTotal = normalizeMoneyAmount(
      liabDash.summary.nonCurrentLiability,
    );

    const totalAssets = normalizeMoneyAmount(
      currentAssetsTotal + nonCurrentAssetsTotal,
    );
    const totalLiabilities = normalizeMoneyAmount(
      liabDash.summary.totalLiability,
    );
    const equityTotal = normalizeMoneyAmount(totalAssets - totalLiabilities);

    const assetPct = totalAssets > 0 ? PERCENT : 0;
    const liabilityPct = percentOf(totalLiabilities, totalAssets);
    const equityPct = percentOf(equityTotal, totalAssets);

    return {
      summary: {
        asset: {
          amount: totalAssets,
          percentage: round2(assetPct),
        },
        liability: {
          amount: totalLiabilities,
          percentage: liabilityPct,
        },
        equity: {
          amount: equityTotal,
          percentage: equityPct,
        },
        total: totalAssets,
      },
      assets: {
        total: totalAssets,
        nonCurrentAssets: {
          total: nonCurrentAssetsTotal,
          items: nonCurrentAssetItems,
        },
        currentAssets: {
          total: currentAssetsTotal,
          items: currentAssetItems,
        },
      },
      liabilities: {
        total: totalLiabilities,
        nonCurrentLiabilities: {
          total: nonCurrentLiabilitiesTotal,
          items: nonCurrentLiabilityItems,
        },
        currentLiabilities: {
          total: currentLiabilitiesTotal,
          items: currentLiabilityItems,
        },
      },
      equity: {
        total: equityTotal,
      },
      financialHealth: {
        currentRatio: currentRatio(currentAssetsTotal, currentLiabilitiesTotal),
        debtToAssetRatio: liabilityPct,
        equityRatio: equityPct,
        workingCapital: normalizeMoneyAmount(
          currentAssetsTotal - currentLiabilitiesTotal,
        ),
      },
    };
  },
};
