import { PERCENT, PERCENT_TWO_DECIMAL_ROUND } from "../../constants/percentages";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { assetsService } from "./assetsService";
import { liabilityService } from "./liabilityService";

const INTANGIBLE_ASSET_TYPES = new Set(["SOFTWARE_LICENSES"]);

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
    const [current, nonCurrent, liab] = await Promise.all([
      assetsService.getCurrentAssetsSnapshot(userId),
      assetsService.nonCurrentAssets(userId),
      liabilityService.getTotals(userId),
    ]);

    let ppe = 0;
    let intangible = 0;
    for (const cat of nonCurrent.categories) {
      if (INTANGIBLE_ASSET_TYPES.has(cat.assetType)) {
        intangible += cat.total;
      } else {
        ppe += cat.total;
      }
    }
    ppe = normalizeMoneyAmount(ppe);
    intangible = normalizeMoneyAmount(intangible);

    const nonCurrentAssetsTotal = normalizeMoneyAmount(
      nonCurrent.netNonCurrentAssets ?? nonCurrent.total ?? ppe + intangible,
    );
    const currentAssetsTotal = normalizeMoneyAmount(current.totalCurrentAssets);

    const currentAssetItems = [
      namedItem("Cash", current.cash.total),
      namedItem("Bank Balance", current.bankBalances.total),
      namedItem("Inventory", current.inventory.total),
      namedItem("Accounts Receivable", current.accountsReceivable.total),
    ];

    const nonCurrentAssetItems = [
      namedItem("Property, Plant & Equipment", ppe),
      namedItem("Intangible Assets", intangible),
    ];

    const currentLiabilityItems = [
      namedItem("Accounts Payable", liab.accountsPayable),
      namedItem("Tax Payable", liab.taxPayable),
      namedItem(
        "Payroll Payable",
        normalizeMoneyAmount(
          liab.salariesPayable + liab.pensionPayable + liab.nhfPayable,
        ),
      ),
    ];
    const currentLiabilitiesTotal = normalizeMoneyAmount(liab.currentLiability);

    const nonCurrentLiabilityItems = NON_CURRENT_LIABILITY_NAMES.map((name) =>
      namedItem(name, 0),
    );
    const nonCurrentLiabilitiesTotal = normalizeMoneyAmount(
      liab.nonCurrentLiability,
    );

    const totalAssets = normalizeMoneyAmount(
      currentAssetsTotal + nonCurrentAssetsTotal,
    );
    const totalLiabilities = normalizeMoneyAmount(liab.totalLiability);
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
