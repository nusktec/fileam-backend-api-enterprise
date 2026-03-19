/**
 * Dummy data seeder: Creates consultant, client, and links them with ~5 months of test data.
 * Run: npm run seed:dummy
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.dev" });

import bcrypt from "bcryptjs";
import { prisma } from "../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import path from "path";
import fs from "fs";

const SALE_CATEGORIES = ["Consulting", "Product Sales", "Service Income", "Subscription", "Other"];
const EXPENSE_CATEGORIES = ["Rent", "Tools & Software", "Marketing", "Internet", "Salary", "Other"];
const EMPLOYMENT_TYPES = ["Part time", "Full time", "Contract"];
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

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
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

  let client = await prisma.user.findUnique({
    where: { email: config.users.client.email },
  });
  if (!client) {
    client = await prisma.user.create({
      data: {
        email: config.users.client.email,
        password,
        firstName: config.users.client.firstName,
        lastName: config.users.client.lastName,
        organizationName: config.users.client.organizationName,
        verified: true,
        onboardingComplete: true,
        enterpriseOnboardingComplete: true,
        enterpriseOnboardingStep: "company_creation",
      },
    });
    await prisma.userRole.create({
      data: { userId: client.id, roleId: businessRole.id },
    });
    console.log("Created client:", client.email);
  } else {
    console.log("Client exists:", client.email);
  }

  let business = await prisma.business.findFirst({
    where: { userId: client.id },
  });
  if (!business) {
    business = await prisma.business.create({
      data: {
        userId: client.id,
        name: config.business.name,
        incomeType: config.business.incomeType,
        taxObligationsUnderstoodAndAccepted: true,
        businessType: config.business.businessType,
        sector: config.business.sector,
        tin: config.business.tin,
        rcNumber: config.business.rcNumber,
        streetAddress: config.business.streetAddress,
        stateOfResidence: config.business.stateOfResidence,
        primaryTaxOffice: config.business.primaryTaxOffice,
        city: config.business.city,
      },
    });
    console.log("Created business for client");
  }

  let company = await prisma.company.findFirst({
    where: { ownerId: consultant.id, linkedUserId: client.id },
  });

  let invitation = await prisma.invitation.findFirst({
    where: {
      consultantUserId: consultant.id,
      invitedEmail: client.email,
      status: "accepted",
    },
  });

  if (!invitation) {
    const code = `INV-${Date.now().toString(36).toUpperCase()}`;
    invitation = await prisma.invitation.create({
      data: {
        code,
        consultantUserId: consultant.id,
        requestedUserId: client.id,
        invitedEmail: client.email,
        invitedBusinessName: config.business.name,
        invitedContactName: `${config.users.client.firstName} ${config.users.client.lastName}`,
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
    console.log("Created consultant connection");
  }

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: config.business.name,
        ownerId: consultant.id,
        linkedUserId: client.id,
        managedByCompanyId: null,
      },
    });
    console.log("Created company for client");
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
      companyName: config.business.name,
      businessType: config.business.businessType ?? "Consulting",
      industry: config.business.sector ?? "IT & Services",
      registrationDate: regDate,
      tin: config.business.tin,
      businessAddress: config.business.streetAddress ?? "123 Main St",
      phoneNumber: "+2348012345678",
      emailAddress: client.email,
      website: "https://acme.example.com",
      subscriptionPlan: "Pro",
      monthlyPayment: 25000,
      nextRenewalDate: addMonths(new Date(), 1),
      compliancePercent: 85,
    },
    update: {},
  });

  const saleRange = config.amountRanges?.sale ?? { min: 50000, max: 500000 };
  const expenseRange = config.amountRanges?.expense ?? { min: 5000, max: 150000 };
  const saleTemplates = config.saleTemplates ?? [];
  const expenseTemplates = config.expenseTemplates ?? [];
  const employeeTemplates = config.employeeTemplates ?? [];

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 5);
  startDate.setDate(1);

  const clientWithNum = await prisma.user.findUnique({
    where: { id: client.id },
    select: { nextSaleNumber: true },
  });
  const existingSales = await prisma.sale.findMany({
    where: { userId: client.id },
    select: { invoiceNumber: true },
  });
  const maxSaleNum = existingSales.reduce((max, s) => {
    const n = parseInt(s.invoiceNumber, 10) || 0;
    return n > max ? n : max;
  }, 0);
  let saleNum = Math.max(clientWithNum?.nextSaleNumber ?? 1, maxSaleNum + 1);

  const EXPENSE_COUNTER_ID = "expense_number";

  async function nextExpenseNumber(): Promise<string> {
    const counter = await prisma.counter.upsert({
      where: { id: EXPENSE_COUNTER_ID },
      create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
  }

  for (let m = 0; m < 5; m++) {
    const monthStart = addMonths(startDate, m);
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth() + 1;

    for (let s = 0; s < 3 + randomInt(0, 4); s++) {
      const template = saleTemplates[s % saleTemplates.length] ?? {
        description: "Sale",
        category: "Consulting",
        customerName: "Customer",
        paymentType: "Transfer",
      };
      const amount = randomInt(saleRange.min, saleRange.max);
      const vatRate = new Decimal(7.5);
      const vatAmount = new Decimal(amount * 0.075);
      const totalAmount = new Decimal(amount + amount * 0.075);
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
          status: "Pending",
        },
      });
    }

    for (let e = 0; e < 2 + randomInt(0, 3); e++) {
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
        description: `Consulting income - ${monthStart.toLocaleString("default", { month: "long" })}`,
        amount: new Decimal(randomInt(100000, 400000)),
        status: "Completed",
        type: "income",
      },
    });

    await prisma.enterpriseFinancialDocument.create({
      data: {
        companyId: company.id,
        documentType: "invoice",
        documentDate: new Date(year, month - 1, randomInt(1, 20)),
        amount: new Decimal(randomInt(50000, 500000)),
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
        vatPayable: new Decimal(randomInt(15000, 120000)),
      },
      update: {},
    });
  }

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
      const startDate = addMonths(new Date(), -randomInt(3, 12));
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
          startDate,
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

  await prisma.user.update({
    where: { id: client.id },
    data: { nextSaleNumber: saleNum },
  });

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

  console.log("Dummy data seed completed!");
  console.log("Consultant:", config.users.consultant.email, "| Client:", config.users.client.email);
  console.log("Password for both: Password123!");
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
