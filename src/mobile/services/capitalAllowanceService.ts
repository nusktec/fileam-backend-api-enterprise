import { prisma } from "../../config/database";
import { ASSET_STATUS } from "../../constants/assets";
import {
  CAPITAL_ALLOWANCE_CLASS_LABELS,
  CAPITAL_ALLOWANCE_EFFECTIVE_FROM,
  CAPITAL_ALLOWANCE_INITIAL_RATE,
  CAPITAL_ALLOWANCE_METHOD,
  CAPITAL_ALLOWANCE_METHOD_LABEL,
  CAPITAL_ALLOWANCE_REGIME_ID,
  CAPITAL_ALLOWANCE_RESIDUAL_RATE,
  CAPITAL_ALLOWANCE_TABLE_I,
  type CapitalAllowanceClass,
  type CapitalAllowanceTaxFlow,
  roundCapitalAllowanceNaira,
  yearOfUseLabel,
} from "../../constants/capitalAllowance";
import { HttpReplyError } from "../../utils/httpReplyError";
import { lagosTodayYmd, lagosYear } from "../../utils/lagosCalendar";

function d(value: { toNumber?: () => number } | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value.toNumber?.() ?? value);
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function yearOf(date: Date | string): number {
  const s = typeof date === "string" ? date : ymd(date);
  return Number(s.slice(0, 4));
}

export function resolveCapitalAllowanceUse(input: {
  taxPersona?: string | null;
  solopreneurRegistration?: string | null;
}): { tax: CapitalAllowanceTaxFlow; entity: string } {
  const persona = (input.taxPersona ?? "").trim().toUpperCase();
  const reg = (input.solopreneurRegistration ?? "").trim().toUpperCase();
  if (persona === "SOLOPRENEUR" && reg === "LIMITED_COMPANY") {
    return { tax: "CIT", entity: "Ltd" };
  }
  if (persona === "SOLOPRENEUR") return { tax: "PIT", entity: "Sole Prop" };
  if (persona === "TRADER") return { tax: "PIT", entity: "Trader" };
  if (persona === "GIG_WORKER") return { tax: "PIT", entity: "Gig Worker" };
  if (persona === "REMOTE_WORKER") return { tax: "PIT", entity: "Remote Worker" };
  if (persona === "PAYEE") return { tax: "PIT", entity: "PAYE" };
  return { tax: "PIT", entity: "Sole Prop" };
}

async function ensureConfigRows(): Promise<void> {
  const count = await prisma.capitalAllowanceConfig.count();
  if (count > 0) return;
  const now = new Date();
  await prisma.capitalAllowanceConfig.createMany({
    data: CAPITAL_ALLOWANCE_TABLE_I.map((row) => ({
      id: `ca-nta-2025-${row.expenditureType}`,
      regimeId: CAPITAL_ALLOWANCE_REGIME_ID,
      taxJurisdiction: "Nigeria",
      taxLaw: "Nigeria Tax Act 2025",
      name: "Nigeria Tax Act 2025",
      shortName: "NTA 2025",
      effectiveFrom: new Date(`${CAPITAL_ALLOWANCE_EFFECTIVE_FROM}T00:00:00.000Z`),
      effectiveTo: null,
      capitalAllowanceClass: row.capitalAllowanceClass,
      expenditureType: row.expenditureType,
      expenditureTypeLabel: row.expenditureTypeLabel,
      annualRate: row.annualRate,
      calculationMethod: CAPITAL_ALLOWANCE_METHOD,
      initialAllowanceApplicable: false,
      initialRate: CAPITAL_ALLOWANCE_INITIAL_RATE,
      residualRate: CAPITAL_ALLOWANCE_RESIDUAL_RATE,
      qualifying: row.qualifying,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    })),
    skipDuplicates: true,
  });
}

async function loadRegimeRows(startDate: Date) {
  await ensureConfigRows();
  return prisma.capitalAllowanceConfig.findMany({
    where: {
      status: "ACTIVE",
      effectiveFrom: { lte: startDate },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: startDate } }],
    },
  });
}

export const capitalAllowanceService = {
  async listExpenditureTypes() {
    const year = lagosYear();
    const startDate = new Date(`${year}-01-01T00:00:00.000Z`);
    const rows = await loadRegimeRows(startDate);
    const byType = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      const existing = byType.get(row.expenditureType);
      if (!existing || existing.effectiveFrom < row.effectiveFrom) {
        byType.set(row.expenditureType, row);
      }
    }
    return {
      expenditureTypes: [...byType.values()].map((row) => ({
        id: row.expenditureType,
        label: row.expenditureTypeLabel,
        qualifying: row.qualifying,
      })),
    };
  },

  expenditureTypeLabel(id: string | null | undefined, types: { id: string; label: string }[]): string | null {
    if (!id) return null;
    return types.find((t) => t.id === id)?.label ?? null;
  },

  async getSchedule(userId: string, year: number) {
    if (!Number.isInteger(year) || year < 1000 || year > 9999) {
      throw new HttpReplyError(400, "year must be a valid YYYY integer");
    }
    const todayYmd = lagosTodayYmd();
    const currentYear = lagosYear();
    if (year > currentYear) {
      throw new HttpReplyError(400, "year cannot be a future year");
    }

    const startDateYmd = `${year}-01-01`;
    const yearEndYmd = `${year}-12-31`;
    const endDateYmd = year === currentYear && todayYmd < yearEndYmd ? todayYmd : yearEndYmd;
    const startDate = new Date(`${startDateYmd}T00:00:00.000Z`);

    const [configRows, assets, user] = await Promise.all([
      loadRegimeRows(startDate),
      prisma.asset.findMany({
        where: { userId, status: ASSET_STATUS.ACTIVE },
        orderBy: [{ purchaseDate: "asc" }, { assetName: "asc" }],
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { taxPersona: true, solopreneurRegistration: true },
      }),
    ]);

    const use = resolveCapitalAllowanceUse({
      taxPersona: user?.taxPersona,
      solopreneurRegistration: user?.solopreneurRegistration,
    });

    const yearBounds = {
      minYear: currentYear - 8,
      maxYear: currentYear,
    };

    const sample = configRows[0];
    const regime = sample
      ? {
          id: sample.regimeId,
          jurisdiction: sample.taxJurisdiction,
          law: sample.taxLaw,
          name: sample.name,
          shortName: sample.shortName,
          effectiveFrom: ymd(sample.effectiveFrom),
          effectiveTo: sample.effectiveTo ? ymd(sample.effectiveTo) : null,
          calculationMethod: sample.calculationMethod,
          calculationMethodLabel: CAPITAL_ALLOWANCE_METHOD_LABEL,
          initialAllowanceApplicable: sample.initialAllowanceApplicable,
          initialRate: d(sample.initialRate),
          residualRate: d(sample.residualRate),
        }
      : null;

    const emptySummary = {
      assetCount: 0,
      qualifyingCost: 0,
      initialAllowance: 0,
      annualAllowance: 0,
      totalAllowance: 0,
      openingTwdv: 0,
      closingTwdv: 0,
    };

    if (!regime) {
      return {
        period: { year, startDate: startDateYmd, endDate: endDateYmd },
        yearBounds,
        regime: null,
        use,
        summary: emptySummary,
        assets: [],
      };
    }

    const configByType = new Map<string, (typeof configRows)[number]>();
    for (const row of configRows) {
      if (!row.qualifying) continue;
      const existing = configByType.get(row.expenditureType);
      if (!existing || existing.effectiveFrom < row.effectiveFrom) {
        configByType.set(row.expenditureType, row);
      }
    }

    const ntaStartYear = yearOf(regime.effectiveFrom);
    const scheduleAssets = [];

    for (const asset of assets) {
      if (asset.assetType === "LAND") continue;
      if (!asset.expenditureType) continue;
      const config = configByType.get(asset.expenditureType);
      if (!config) continue;
      const purchaseCost = d(asset.purchaseCost);
      if (purchaseCost <= 0) continue;
      const businessUsePercent = Math.min(100, Math.max(0, d(asset.businessUsePercent)));
      const qualifyingCost = roundCapitalAllowanceNaira(
        (purchaseCost * businessUsePercent) / 100,
      );
      if (qualifyingCost <= 0) continue;
      const putIntoUse = ymd(asset.purchaseDate);
      if (putIntoUse > endDateYmd) continue;

      const firstAllowanceYear = Math.max(yearOf(asset.purchaseDate), ntaStartYear);
      if (year < firstAllowanceYear) continue;

      const annualRate = d(config.annualRate);
      const residualRate = d(config.residualRate);
      const residualValue = roundCapitalAllowanceNaira(qualifyingCost * residualRate);
      const uncappedAnnual = roundCapitalAllowanceNaira(qualifyingCost * annualRate);

      let openingTwdv = qualifyingCost;
      let annualAllowance = 0;
      let closingTwdv = qualifyingCost;
      for (let y = firstAllowanceYear; y <= year; y++) {
        openingTwdv = y === firstAllowanceYear ? qualifyingCost : closingTwdv;
        if (openingTwdv <= residualValue) {
          annualAllowance = 0;
          closingTwdv = openingTwdv;
        } else {
          annualAllowance = Math.min(
            uncappedAnnual,
            roundCapitalAllowanceNaira(Math.max(0, openingTwdv - residualValue)),
          );
          closingTwdv = roundCapitalAllowanceNaira(openingTwdv - annualAllowance);
          if (closingTwdv < residualValue) closingTwdv = residualValue;
        }
      }

      const yearOfUse = year - firstAllowanceYear + 1;
      const assetClass = config.capitalAllowanceClass as CapitalAllowanceClass;
      scheduleAssets.push({
        assetId: asset.assetCode,
        name: asset.assetName,
        assetType: asset.assetType,
        assetClass,
        assetClassLabel: CAPITAL_ALLOWANCE_CLASS_LABELS[assetClass] ?? assetClass,
        expenditureType: asset.expenditureType,
        expenditureTypeLabel: config.expenditureTypeLabel,
        datePutIntoUse: putIntoUse,
        yearOfUse,
        yearOfUseLabel: yearOfUseLabel(yearOfUse),
        isAcquisitionYear: year === firstAllowanceYear,
        acquisitionCost: roundCapitalAllowanceNaira(purchaseCost),
        businessUsePercent,
        qualifyingCost,
        annualRate,
        initialRate: d(config.initialRate),
        initialAllowance: 0,
        annualAllowance,
        totalAllowance: annualAllowance,
        openingTwdv,
        closingTwdv,
        residualValue,
        cumulativeAllowance: roundCapitalAllowanceNaira(qualifyingCost - closingTwdv),
      });
    }

    scheduleAssets.sort((a, b) => {
      if (a.datePutIntoUse !== b.datePutIntoUse) {
        return a.datePutIntoUse < b.datePutIntoUse ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const summary = scheduleAssets.reduce(
      (acc, row) => {
        acc.assetCount += 1;
        acc.qualifyingCost = roundCapitalAllowanceNaira(acc.qualifyingCost + row.qualifyingCost);
        acc.initialAllowance = roundCapitalAllowanceNaira(
          acc.initialAllowance + row.initialAllowance,
        );
        acc.annualAllowance = roundCapitalAllowanceNaira(
          acc.annualAllowance + row.annualAllowance,
        );
        acc.totalAllowance = roundCapitalAllowanceNaira(
          acc.totalAllowance + row.totalAllowance,
        );
        acc.openingTwdv = roundCapitalAllowanceNaira(acc.openingTwdv + row.openingTwdv);
        acc.closingTwdv = roundCapitalAllowanceNaira(acc.closingTwdv + row.closingTwdv);
        return acc;
      },
      { ...emptySummary },
    );

    return {
      period: { year, startDate: startDateYmd, endDate: endDateYmd },
      yearBounds,
      regime,
      use,
      summary,
      assets: scheduleAssets,
    };
  },
};
