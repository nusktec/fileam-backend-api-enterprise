/**
 * Dummy data seeder: Creates consultant, multiple clients with threshold scenarios, and test data.
 * Run: npm run seed:dummy
 *
 * Clients created:
 * - client@fileam.app (default, varied data)
 * - below-threshold@fileam.app (~10M annual turnover)
 * - approaching-threshold@fileam.app (~23M annual turnover)
 * - above-threshold@fileam.app (~28M annual turnover)
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.dev" });

import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import path from "path";
import fs from "fs";
import { seedInventoryDummyDataForUser } from "./inventoryDummySeed";
import { PERCENT, VAT_RATE_PERCENT, VAT_TURNOVER_THRESHOLD_NGN } from "../constants/percentages";

const SALE_CATEGORIES = ["Consulting", "Product Sales", "Service Income", "Subscription", "Other"];
const EXPENSE_CATEGORIES = ["Rent", "Tools & Software", "Marketing", "Internet", "Salary", "Other"];
const PAYMENT_TYPES = ["Transfer", "Cash", "Card", "Cheque"];

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function addMonths(d: Date, months: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return result;
}

const EXPENSE_COUNTER_ID = "expense_number";

async function nextExpenseNumber(): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: EXPENSE_COUNTER_ID },
    create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(5, "0")}`;
}

async function runSeedDummy() {
  const configPath = path.join(__dirname, "dummy-data.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

  const password = await bcrypt.hash(config.users.client.password, 10);
  const consultantPassword = await bcrypt.hash(config.users.consultant.password, 10);

  const businessRole = await prisma.role.findFirst({ where: { name: "business" } });
  if (!businessRole) throw new Error("Run base seed first: npm run seed");

  let consultant = await prisma.user.findUnique({
    where: { email: config.users.consultant.email },
  });
  if (!consultant) {
    consultant = await prisma.user.create({
      data: {
        email: config.users.consultant.email,
        password: consultantPassword,
        firstName: config.users.consultant.firstName,
        lastName: config.users.consultant.lastName,
        organizationName: config.users.consultant.organizationName,
        verified: true,
        onboardingComplete: true,
        enterpriseOnboardingComplete: true,
        enterpriseOnboardingStep: "company_creation",
      },
    });
    await prisma.userRole.create({
      data: { userId: consultant.id, roleId: businessRole.id },
    });
    console.log("Created consultant:", consultant.email);
  } else {
    console.log("Consultant exists:", consultant.email);
  }

  const clientList = config.clients ?? [
    {
      ...config.users.client,
      organizationName: config.users.client.organizationName,
      thresholdScenario: "default",
      business: config.business,
    },
  ];

  const saleTemplates = config.saleTemplates ?? [];
  const expenseTemplates = config.expenseTemplates ?? [];
  const employeeTemplates = config.employeeTemplates ?? [];
  const defaultSaleRange = config.amountRanges?.sale ?? { min: 50000, max: 500000 };
  const defaultExpenseRange = config.amountRanges?.expense ?? { min: 5000, max: 150000 };
  const thresholdScenarios = config.thresholdScenarios ?? {};

  for (const clientConfig of clientList) {
    const scenario = clientConfig.thresholdScenario ?? "default";
    const scenarioConfig = thresholdScenarios[scenario];
    const isThresholdClient = scenario && scenario !== "default" && scenarioConfig;

    let client = await prisma.user.findUnique({
      where: { email: clientConfig.email },
    });
    if (!client) {
      client = await prisma.user.create({
        data: {
          email: clientConfig.email,
          password,
          firstName: clientConfig.firstName,
          lastName: clientConfig.lastName,
          organizationName: clientConfig.organizationName,
          verified: true,
          onboardingComplete: true,
          enterpriseOnboardingComplete: true,
          enterpriseOnboardingStep: "company_creation",
        },
      });
      await prisma.userRole.create({
        data: { userId: client.id, roleId: businessRole.id },
      });
      console.log("Created client:", client.email, `(${scenario})`);
    } else {
      console.log("Client exists:", client.email, `(${scenario})`);
    }

    const biz = clientConfig.business ?? config.business;
    let business = await prisma.business.findFirst({
      where: { userId: client.id },
    });
    if (!business) {
      business = await prisma.business.create({
        data: {
          userId: client.id,
          name: biz.name,
          incomeType: biz.incomeType,
          taxObligationsUnderstoodAndAccepted: true,
          businessType: biz.businessType,
          sector: biz.sector,
          tin: biz.tin,
          rcNumber: biz.rcNumber,
          streetAddress: biz.streetAddress,
          stateOfResidence: biz.stateOfResidence,
          primaryTaxOffice: biz.primaryTaxOffice,
          city: biz.city,
        },
      });
    }

    let invitation = await prisma.invitation.findFirst({
      where: {
        consultantUserId: consultant.id,
        invitedEmail: client.email,
        status: "accepted",
      },
    });

    if (!invitation) {
      invitation = await prisma.invitation.create({
        data: {
          code: `INV-${Date.now().toString(36).toUpperCase()}-${client.id.slice(0, 6)}`,
          consultantUserId: consultant.id,
          requestedUserId: client.id,
          invitedEmail: client.email,
          invitedBusinessName: biz.name,
          invitedContactName: `${clientConfig.firstName} ${clientConfig.lastName}`,
          status: "accepted",
          expiresAt: addMonths(new Date(), 1),
        },
      });
    }

    let connection = await prisma.consultantConnection.findFirst({
      where: {
        consultantUserId: consultant.id,
        userId: client.id,
      },
    });

    if (!connection) {
      connection = await prisma.consultantConnection.create({
        data: {
          consultantUserId: consultant.id,
          userId: client.id,
          invitationId: invitation.id,
          acceptedAt: new Date(),
          consultantTermsAccepted: true,
          status: "active",
          consultantDisplayName: config.users.consultant.organizationName,
        },
      });
    }

    let company = await prisma.company.findFirst({
      where: { ownerId: consultant.id, linkedUserId: client.id },
    });

    if (!company) {
      company = await prisma.company.create({
        data: {
          name: biz.name,
          ownerId: consultant.id,
          linkedUserId: client.id,
          managedByCompanyId: null,
        },
      });
    }

    await prisma.clientTaxConfiguration.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        vat: true,
        paye: true,
        wht: true,
        cit: false,
      },
      update: {},
    });

    const regDate = addMonths(new Date(), -12);
    await prisma.enterpriseBusinessProfile.upsert({
      where: { companyId: company.id },
      create: {
        companyId: company.id,
        companyName: biz.name,
        businessType: biz.businessType ?? "Consulting",
        industry: biz.sector ?? "IT & Services",
        registrationDate: regDate,
        tin: biz.tin,
        businessAddress: biz.streetAddress ?? "123 Main St",
        phoneNumber: "+2348012345678",
        emailAddress: client.email,
        website: "https://example.com",
        subscriptionPlan: "Pro",
        monthlyPayment: 25000,
        nextRenewalDate: addMonths(new Date(), 1),
        compliancePercent: 85,
      },
      update: {},
    });

    const vatThresholdLabel = `N${VAT_TURNOVER_THRESHOLD_NGN.toLocaleString("en-NG")}`;
    const thresholdMessages: Record<string, string> = {
      below: `This business turnover in the last 12 months is below ${vatThresholdLabel}. VAT registration is not currently required.`,
      approaching: `This business is approaching the VAT threshold of ${vatThresholdLabel}. Consider preparing for VAT registration.`,
      above: `This business turnover exceeds ${vatThresholdLabel}. VAT registration is required.`,
    };

    if (isThresholdClient) {
      await prisma.enterpriseThresholdStatus.upsert({
        where: { companyId: company.id },
        create: {
          companyId: company.id,
          status: scenario,
          message: thresholdMessages[scenario] ?? thresholdMessages.below,
        },
        update: {
          status: scenario,
          message: thresholdMessages[scenario] ?? thresholdMessages.below,
        },
      });
    }

    const saleRange = scenarioConfig?.saleRange ?? defaultSaleRange;
    const expenseRange = scenarioConfig?.expenseRange ?? defaultExpenseRange;
    const salesPerMonth = scenarioConfig?.salesPerMonth ?? 3 + randomInt(0, 4);
    const expensesPerMonth = scenarioConfig?.expensesPerMonth ?? 2 + randomInt(0, 3);
    const numMonths = isThresholdClient ? 12 : 5;

    if (isThresholdClient) {
      await prisma.sale.deleteMany({ where: { userId: client.id } });
      await prisma.expense.deleteMany({ where: { userId: client.id } });
      await prisma.taxPayable.deleteMany({ where: { userId: client.id } });
      await prisma.filingDraft.deleteMany({ where: { userId: client.id } });
      await prisma.report.deleteMany({ where: { userId: client.id } });
      await prisma.enterpriseFinancialDocument.deleteMany({
        where: { companyId: company.id },
      });
      await prisma.enterpriseTransaction.deleteMany({ where: { companyId: company.id } });
      await prisma.enterpriseVatMonthly.deleteMany({ where: { companyId: company.id } });
      console.log("  Reset financial data for", client.email);
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - numMonths);
    startDate.setDate(1);

    const existingSales = await prisma.sale.findMany({
      where: { userId: client.id },
      select: { invoiceNumber: true },
    });
    const maxSaleNum = existingSales.reduce((max, s) => {
      const n = parseInt(s.invoiceNumber, 10) || 0;
      return n > max ? n : max;
    }, 0);
    const clientWithNum = await prisma.user.findUnique({
      where: { id: client.id },
      select: { nextSaleNumber: true },
    });
    let saleNum = Math.max(clientWithNum?.nextSaleNumber ?? 1, maxSaleNum + 1);

    for (let m = 0; m < numMonths; m++) {
      const monthStart = addMonths(startDate, m);
      const year = monthStart.getFullYear();
      const month = monthStart.getMonth() + 1;

      const targetMonthlySales = scenarioConfig?.monthlySaleTotal;
      let salesCreated = 0;
      let salesSum = 0;

      for (let s = 0; s < salesPerMonth; s++) {
        const template = saleTemplates[s % saleTemplates.length] ?? {
          description: "Sale",
          category: "Consulting",
          customerName: "Customer",
          paymentType: "Transfer",
        };
        let amount: number;
        if (targetMonthlySales && s === salesPerMonth - 1) {
          amount = Math.max(saleRange.min, Math.min(saleRange.max, targetMonthlySales - salesSum));
          if (amount < saleRange.min) amount = randomInt(saleRange.min, saleRange.max);
        } else {
          amount = randomInt(saleRange.min, saleRange.max);
        }
        salesSum += amount;
        salesCreated++;

        const vatRate = new Decimal(VAT_RATE_PERCENT);
        const vatFraction = VAT_RATE_PERCENT / PERCENT;
        const vatAmount = new Decimal(amount * vatFraction);
        const totalAmount = new Decimal(amount + amount * vatFraction);
        const saleDate = new Date(year, month - 1, randomInt(1, 25));

        await prisma.sale.create({
          data: {
            userId: client.id,
            createdById: client.id,
            invoiceNumber: String(saleNum++),
            description: template.description,
            category: template.category ?? randomPick(SALE_CATEGORIES),
            customerName: template.customerName ?? null,
            amount: new Decimal(amount),
            vatRate,
            vatAmount,
            totalAmount,
            paymentType: template.paymentType ?? randomPick(PAYMENT_TYPES),
            saleDate,
            vatableIncome: true,
            serviceIncome: true,
            status: randomPick(["Pending", "Paid"]),
          },
        });
      }

      for (let e = 0; e < expensesPerMonth; e++) {
        const template = expenseTemplates[e % expenseTemplates.length] ?? {
          description: "Expense",
          category: "Other",
        };
        const amount = randomInt(expenseRange.min, expenseRange.max);
        const totalAmount = new Decimal(amount);
        const expenseDate = new Date(year, month - 1, randomInt(1, 28));
        const expenseNumber = await nextExpenseNumber();

        await prisma.expense.create({
          data: {
            userId: client.id,
            createdById: client.id,
            expenseNumber,
            description: template.description,
            category: template.category ?? randomPick(EXPENSE_CATEGORIES),
            amount: new Decimal(amount),
            vatInclusive: false,
            vatAmount: null,
            totalAmount,
            expenseDate,
          },
        });
      }

      const filingDue = new Date(year, month, 21);
      await prisma.taxPayable.upsert({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId: client.id,
            taxType: "VAT",
            periodYear: year,
            periodMonth: month,
          },
        },
        create: {
          userId: client.id,
          taxType: "VAT",
          periodYear: year,
          periodMonth: month,
          amountDue: new Decimal(randomInt(20000, 150000)),
          penalties: new Decimal(0),
          totalPayable: new Decimal(randomInt(20000, 150000)),
          filingDueDate: filingDue,
          status: randomPick(["pending", "submitted", "paid"]),
          currency: "NGN",
        },
        update: {},
      });

      await prisma.filingDraft.upsert({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId: client.id,
            taxType: "VAT",
            periodYear: year,
            periodMonth: month,
          },
        },
        create: {
          userId: client.id,
          taxType: "VAT",
          periodYear: year,
          periodMonth: month,
          status: "draft",
        },
        update: {},
      });

      await prisma.report.create({
        data: {
          userId: client.id,
          reportType: "VAT Return Summary",
          periodLabel: `${year}-${String(month).padStart(2, "0")}`,
          periodYear: year,
          periodMonth: month,
          generatedAt: new Date(year, month - 1, randomInt(15, 28)),
          format: "PDF",
          status: "stored",
        },
      });

      await prisma.enterpriseTransaction.create({
        data: {
          companyId: company.id,
          date: new Date(year, month - 1, randomInt(15, 25)),
          description: `Income - ${monthStart.toLocaleString("default", { month: "long" })} ${year}`,
          amount: new Decimal(salesSum),
          status: "Completed",
          type: "income",
        },
      });

      await prisma.enterpriseFinancialDocument.create({
        data: {
          companyId: company.id,
          documentType: "invoice",
          documentDate: new Date(year, month - 1, randomInt(1, 20)),
          amount: new Decimal(randomInt(50000, Math.min(500000, salesSum))),
          currency: "NGN",
          processingStatus: "completed",
          vendor: "Client",
          invoiceNumber: `INV-${year}${String(month).padStart(2, "0")}-${randomInt(1, 99)}`,
        },
      });

      await prisma.enterpriseVatMonthly.upsert({
        where: {
          companyId_year_month: {
            companyId: company.id,
            year,
            month,
          },
        },
        create: {
          companyId: company.id,
          month,
          year,
          vatPayable: new Decimal(
            Math.round(salesSum * (VAT_RATE_PERCENT / PERCENT)),
          ),
        },
        update: {
          vatPayable: new Decimal(
            Math.round(salesSum * (VAT_RATE_PERCENT / PERCENT)),
          ),
        },
      });
    }

    await prisma.user.update({
      where: { id: client.id },
      data: { nextSaleNumber: saleNum },
    });

    const EMPLOYEE_COUNTER_ID = "employee_id";
    let employeeCounter = await prisma.counter.findUnique({
      where: { id: EMPLOYEE_COUNTER_ID },
    });
    if (!employeeCounter) {
      employeeCounter = await prisma.counter.create({
        data: { id: EMPLOYEE_COUNTER_ID, lastNumber: 0 },
      });
    }
    let lastEmpNum = employeeCounter.lastNumber;

    for (let i = 0; i < employeeTemplates.length; i++) {
      const t = employeeTemplates[i];
      const existing = await prisma.employee.findFirst({
        where: { userId: client.id, fullName: t.fullName },
      });
      if (!existing) {
        lastEmpNum += 1;
        const empStartDate = addMonths(new Date(), -randomInt(3, 12));
        await prisma.employee.create({
          data: {
            userId: client.id,
            employeeId: `TH${String(lastEmpNum).padStart(3, "0")}`,
            fullName: t.fullName,
            jobTitle: t.jobTitle,
            employmentType: t.employmentType,
            basicSalary: new Decimal(t.basicSalary),
            housingAllowance: new Decimal(t.housingAllowance ?? 0),
            transportAllowance: new Decimal(0),
            mealAllowance: new Decimal(0),
            otherAllowances: new Decimal(0),
            startDate: empStartDate,
          },
        });
      }
    }
    if (lastEmpNum > employeeCounter.lastNumber) {
      await prisma.counter.update({
        where: { id: EMPLOYEE_COUNTER_ID },
        data: { lastNumber: lastEmpNum },
      });
    }

    const existingInvCount = await prisma.enterpriseInvoice.count({
      where: { companyId: company.id },
    });
    if (existingInvCount === 0) {
      for (let i = 0; i < 3; i++) {
        const d = addMonths(new Date(), -i);
        await prisma.enterpriseInvoice.create({
          data: {
            companyId: company.id,
            invoiceNumber: `INV-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}-${100 + i}`,
            clientName: "Tech Corp Nigeria",
            clientAddress: "45 Marina, Lagos",
            clientEmail: "billing@techcorp.ng",
            dateIssued: d,
            dueDate: addMonths(d, 1),
            paymentStatus: i === 0 ? "Outstanding" : "Paid",
            totalAmount: new Decimal(randomInt(150000, 500000)),
          },
        });
      }
    }

    const existingDocCount = await prisma.enterpriseEvidenceDocument.count({
      where: { companyId: company.id },
    });
    if (existingDocCount === 0) {
      for (let i = 0; i < 3; i++) {
        const d = addMonths(new Date(), -i);
        await prisma.enterpriseEvidenceDocument.create({
          data: {
            companyId: company.id,
            documentName: `Contract ${i + 1}`,
            category: "contracts",
            documentDate: d,
            description: "Client agreement",
            status: "Approved",
          },
        });
      }
    }
  }

  const inventorySeedEmails = [
    config.users.consultant.email,
    config.users.client.email,
  ];
  for (const email of inventorySeedEmails) {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      const seeded = await seedInventoryDummyDataForUser(u.id);
      if (seeded) console.log("Seeded inventory dummy data for", email);
    }
  }

  console.log("\nDummy data seed completed!");
  console.log("Consultant:", config.users.consultant.email);
  console.log("Clients:", clientList.map((c: { email: string }) => c.email).join(", "));
  console.log("Password for all users: Password123!");
  console.log("\nThreshold scenarios:");
  console.log("  - below-threshold@fileam.app: Below VAT threshold (~10M turnover)");
  console.log("  - approaching-threshold@fileam.app: Approaching VAT threshold (~23M turnover)");
  console.log("  - above-threshold@fileam.app: Above VAT threshold (~28M turnover)");
}

if (require.main === module) {
  runSeedDummy()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed failed:", err);
      process.exit(1);
    });
}

export { runSeedDummy };
