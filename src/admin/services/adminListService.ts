import { prisma } from "../../config/database";
import { invitationFieldsForConsultant } from "../../utils/invitationPresenter";
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

function n(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

export type AdminListOpts = {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  dateFrom?: Date;
  dateTo?: Date;
  filters?: Record<string, string | boolean | undefined>;
};

function paginateMeta(total: number, page: number, limit: number) {
  return {
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export const adminListService = {
  async listUsers(opts: AdminListOpts) {
    const where: Prisma.UserWhereInput = {};
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { email: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { organizationName: { contains: q, mode: "insensitive" } },
      ];
    }
    if (opts.filters?.verified === "true") where.verified = true;
    if (opts.filters?.verified === "false") where.verified = false;
    if (opts.filters?.onboardingComplete === "true")
      where.onboardingComplete = true;
    if (opts.filters?.enterprise === "true")
      where.enterpriseOnboardingComplete = true;
    if (opts.dateFrom || opts.dateTo) {
      where.createdAt = {};
      if (opts.dateFrom) where.createdAt.gte = opts.dateFrom;
      if (opts.dateTo) where.createdAt.lte = opts.dateTo;
    }

    const orderField =
      opts.sortBy === "email" ||
      opts.sortBy === "firstName" ||
      opts.sortBy === "lastName" ||
      opts.sortBy === "createdAt"
        ? opts.sortBy
        : "createdAt";

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { [orderField]: opts.sortOrder },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          verified: true,
          onboardingComplete: true,
          enterpriseOnboardingComplete: true,
          taxPersona: true,
          organizationName: true,
          requestDelete: true,
          createdAt: true,
          userRoles: { include: { role: { select: { name: true } } } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: rows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        verified: u.verified,
        onboardingComplete: u.onboardingComplete,
        enterpriseOnboardingComplete: u.enterpriseOnboardingComplete,
        taxPersona: u.taxPersona,
        organizationName: u.organizationName,
        requestDelete: u.requestDelete,
        roles: u.userRoles.map((r) => r.role.name),
        createdAt: u.createdAt,
      })),
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },

  async getUser(id: string) {
    const u = await prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: { include: { role: true } },
        businesses: { take: 5 },
        ownedCompanies: { take: 5 },
        _count: {
          select: {
            sales: true,
            expenses: true,
            taxPayables: true,
          },
        },
      },
    });
    if (!u) return null;
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      verified: u.verified,
      onboardingComplete: u.onboardingComplete,
      enterpriseOnboardingComplete: u.enterpriseOnboardingComplete,
      taxPersona: u.taxPersona,
      organizationName: u.organizationName,
      requestDelete: u.requestDelete,
      roles: u.userRoles.map((r) => r.role.name),
      businesses: u.businesses,
      companies: u.ownedCompanies,
      counts: u._count,
      createdAt: u.createdAt,
    };
  },

  async patchUser(
    id: string,
    data: Partial<{ verified: boolean; requestDelete: boolean }>,
  ) {
    return prisma.user.update({
      where: { id },
      data,
      select: { id: true, verified: true, requestDelete: true },
    });
  },

  async listCompanies(opts: AdminListOpts) {
    const where: Prisma.CompanyWhereInput = {};
    if (opts.search?.trim()) {
      where.name = { contains: opts.search.trim(), mode: "insensitive" };
    }
    const [rows, total] = await Promise.all([
      prisma.company.findMany({
        where,
        orderBy: { createdAt: opts.sortOrder },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          owner: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          linkedUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
          _count: { select: { managedCompanies: true } },
        },
      }),
      prisma.company.count({ where }),
    ]);
    return {
      data: rows.map((c) => ({
        id: c.id,
        name: c.name,
        owner: c.owner,
        linkedUser: c.linkedUser,
        managedClientCount: c._count.managedCompanies,
        createdAt: c.createdAt,
      })),
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },

  async listSales(opts: AdminListOpts) {
    const where: Prisma.SaleWhereInput = {};
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { description: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { itemName: { contains: q, mode: "insensitive" } },
      ];
    }
    if (opts.filters?.status) where.status = String(opts.filters.status);
    if (opts.filters?.userId) where.userId = String(opts.filters.userId);
    if (opts.dateFrom || opts.dateTo) {
      where.saleDate = {};
      if (opts.dateFrom) where.saleDate.gte = opts.dateFrom;
      if (opts.dateTo) where.saleDate.lte = opts.dateTo;
    }

    const order = opts.sortOrder === "asc" ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: [{ saleDate: order }, { createdAt: order }],
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.sale.count({ where }),
    ]);

    return {
      data: rows.map((s) => ({
        id: s.id,
        userId: s.userId,
        user: s.user,
        invoiceNumber: s.invoiceNumber,
        description: s.description,
        itemName: s.itemName,
        category: s.category,
        customerName: s.customerName,
        amount: n(s.amount),
        totalAmount: n(s.totalAmount),
        status: s.status,
        paymentType: s.paymentType,
        saleDate: s.saleDate,
      })),
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },

  async listExpenses(opts: AdminListOpts) {
    const where: Prisma.ExpenseWhereInput = {};
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { description: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { supplierName: { contains: q, mode: "insensitive" } },
        { expenseNumber: { contains: q, mode: "insensitive" } },
      ];
    }
    if (opts.filters?.userId) where.userId = String(opts.filters.userId);
    if (opts.dateFrom || opts.dateTo) {
      where.expenseDate = {};
      if (opts.dateFrom) where.expenseDate.gte = opts.dateFrom;
      if (opts.dateTo) where.expenseDate.lte = opts.dateTo;
    }

    const order = opts.sortOrder === "asc" ? "asc" : "desc";
    const [rows, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: order }, { createdAt: order }],
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.expense.count({ where }),
    ]);

    return {
      data: rows.map((e) => ({
        id: e.id,
        userId: e.userId,
        user: e.user,
        expenseNumber: e.expenseNumber,
        description: e.description,
        category: e.category,
        supplierName: e.supplierName,
        totalAmount: n(e.totalAmount),
        expenseDate: e.expenseDate,
      })),
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },

  async listTaxPayables(opts: AdminListOpts) {
    const where: Prisma.TaxPayableWhereInput = {};
    if (opts.search?.trim()) {
      where.taxType = { contains: opts.search.trim(), mode: "insensitive" };
    }
    if (opts.filters?.status) where.status = String(opts.filters.status);
    if (opts.filters?.taxType) where.taxType = String(opts.filters.taxType);

    const [rows, total] = await Promise.all([
      prisma.taxPayable.findMany({
        where,
        orderBy: [
          { periodYear: opts.sortOrder },
          { periodMonth: opts.sortOrder },
        ],
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.taxPayable.count({ where }),
    ]);

    return {
      data: rows.map((p) => ({
        id: p.id,
        userId: p.userId,
        user: p.user,
        taxType: p.taxType,
        periodYear: p.periodYear,
        periodMonth: p.periodMonth,
        amountDue: n(p.amountDue),
        totalPayable: n(p.totalPayable),
        status: p.status,
        filingDueDate: p.filingDueDate,
      })),
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },

  async listInvitations(opts: AdminListOpts) {
    const where: Prisma.InvitationWhereInput = {};
    if (opts.filters?.status) {
      where.status = opts.filters.status as Prisma.EnumInvitationStatusFilter;
    }
    if (opts.search?.trim()) {
      const q = opts.search.trim();
      where.OR = [
        { invitedEmail: { contains: q, mode: "insensitive" } },
        { code: { contains: q, mode: "insensitive" } },
        { invitedContactName: { contains: q, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.invitation.findMany({
        where,
        orderBy: { createdAt: opts.sortOrder },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          consultantUser: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.invitation.count({ where }),
    ]);

    return {
      data: rows.map((i) => ({
        id: i.id,
        invitedEmail: i.invitedEmail,
        invitedContactName: i.invitedContactName,
        status: i.status,
        ...invitationFieldsForConsultant(i.initiator),
        consultant: i.consultantUser,
        createdAt: i.createdAt,
      })),
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },

  async listConsultantOnboarding(opts: AdminListOpts) {
    const where: Prisma.ConsultantOnboardingSessionWhereInput = {};
    if (opts.filters?.status) where.status = String(opts.filters.status);

    const [rows, total] = await Promise.all([
      prisma.consultantOnboardingSession.findMany({
        where,
        orderBy: { createdAt: opts.sortOrder },
        skip: (opts.page - 1) * opts.limit,
        take: opts.limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.consultantOnboardingSession.count({ where }),
    ]);

    return {
      data: rows,
      ...paginateMeta(total, opts.page, opts.limit),
    };
  },
};
