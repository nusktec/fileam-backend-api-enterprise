import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { PERCENT_TWO_DECIMAL_ROUND } from "../../constants/percentages";
import type { EvidenceVaultUploadInput, EvidenceVaultSignInput } from "../../interfaces/enterprise/evidenceVault";
import { enterpriseFinancialsService } from "./enterpriseFinancialsService";

const EVIDENCE_CATEGORIES = [
  "Contracts",
  "Receipts",
  "Legal Documents",
  "Reports",
  "Invoices",
  "Tax Documents",
  "Other",
];
const DOCUMENT_STATUSES = ["Pending", "Approved", "Rejected"];
const STORAGE_LIMIT_GB = 5;

export const enterpriseEvidenceVaultService = {
  getCategories: () => EVIDENCE_CATEGORIES,
  getStatuses: () => DOCUMENT_STATUSES,

  async getStats(companyId: string, linkedUserId?: string) {
    const categories = await this.getCategoriesWithCounts(companyId, linkedUserId);
    if (!categories) return null;
    const total = categories.reduce((s, c) => s + c.count, 0);
    const storage = linkedUserId
      ? { usedGb: 0, limitGb: STORAGE_LIMIT_GB, usedKb: 0 }
      : await this.getStorageUsage(companyId);
    const byName = Object.fromEntries(categories.map((c) => [c.name, c.count]));
    return {
      total,
      byCategory: categories,
      storage: storage ?? { usedGb: 0, limitGb: STORAGE_LIMIT_GB, usedKb: 0 },
      metrics: {
        allDocument: total,
        invoice: byName["Invoices"] ?? byName["Invoice"] ?? 0,
        receipts: byName["Receipts"] ?? 0,
        vatSchedules: byName["Tax Documents"] ?? 0,
        filings: 0,
        whtCerts: 0,
      },
    };
  },

  async getCategoriesWithCounts(companyId: string, linkedUserId?: string) {
    if (linkedUserId) {
      const { evidenceVaultService } = await import("../../mobile/services/evidenceVaultService");
      const docs = await evidenceVaultService.listDocuments(linkedUserId);
      const counts: Record<string, number> = {};
      for (const c of EVIDENCE_CATEGORIES) counts[c] = 0;
      for (const d of docs) {
        const cat = EVIDENCE_CATEGORIES.includes(d.category as never)
          ? d.category
          : "Other";
        counts[cat] = (counts[cat] ?? 0) + 1;
      }
      return Object.entries(counts).map(([name, count]) => ({
        name,
        count,
        label: `${name}: ${count} Documents`,
      }));
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const docs = await prisma.enterpriseEvidenceDocument.findMany({
      where: { companyId },
    });
    const counts: Record<string, number> = {};
    for (const c of EVIDENCE_CATEGORIES) counts[c] = 0;
    for (const d of docs) {
      counts[d.category] = (counts[d.category] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, count]) => ({
      name,
      count,
      label: `${name}: ${count} Documents`,
    }));
  },

  async getRecentDocuments(companyId: string, limit = 10, linkedUserId?: string) {
    if (linkedUserId) {
      const { evidenceVaultService } = await import("../../mobile/services/evidenceVaultService");
      const docs = await evidenceVaultService.listDocuments(linkedUserId);
      return docs.slice(0, limit).map((d) => ({
        id: d.id,
        date: d.date,
        documentName: d.name,
        type: d.category,
        status: "Recorded",
      }));
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const list = await prisma.enterpriseEvidenceDocument.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return list.map((d) => ({
      id: d.id,
      date: d.documentDate,
      documentName: d.documentName,
      type: d.category,
      status: d.status,
    }));
  },

  async getStorageUsage(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const docs = await prisma.enterpriseEvidenceDocument.findMany({
      where: { companyId },
    });
    let totalKb = 0;
    for (const d of docs) totalKb += d.fileSizeKb ?? 0;
    const usedGb = totalKb / (1024 * 1024);
    return {
      usedGb:
        Math.round(usedGb * PERCENT_TWO_DECIMAL_ROUND) /
        PERCENT_TWO_DECIMAL_ROUND,
      limitGb: STORAGE_LIMIT_GB,
      usedKb: totalKb,
      label: `${usedGb.toFixed(2)} GB / ${STORAGE_LIMIT_GB} GB used`,
    };
  },

  async listDocuments(
    companyId: string,
    filters?: {
      search?: string;
      category?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
      dateFrom?: Date;
      dateTo?: Date;
    },
    opts?: { page?: number; limit?: number; sortOrder?: "ASC" | "DESC" },
    linkedUserId?: string,
  ) {
    if (linkedUserId) {
      const { evidenceVaultService } = await import("../../mobile/services/evidenceVaultService");
      const catMap: Record<string, string> = {
        Invoices: "invoices",
        Receipts: "receipts",
        "VAT Schedules": "vat_schedules",
        "WHT Notes": "wht_notes",
        "Legal Documents": "filings",
        Reports: "filings",
        Contracts: "filings",
        "Tax Documents": "filings",
        Other: "all",
      };
      const mobileCat =
        filters?.category && filters.category !== "all"
          ? catMap[filters.category] ?? "all"
          : undefined;
      const docs = await evidenceVaultService.listDocuments(linkedUserId, {
        search: filters?.search,
        category: mobileCat,
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
      });
      const page = opts?.page ?? 1;
      const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
      const start = (page - 1) * limit;
      const data = docs.slice(start, start + limit).map((d) => ({
        id: d.id,
        documentName: d.name,
        category: d.category,
        dateUploaded: d.date,
        status: "Recorded",
        fileUrl: d.documentUrl,
      }));
      return { data, total: docs.length, page, limit };
    }
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const where: {
      companyId: string;
      category?: string;
      status?: string;
      documentDate?: { gte?: Date; lte?: Date };
      OR?: Array<{
        documentName?: { contains: string; mode: "insensitive" };
        description?: { contains: string; mode: "insensitive" };
      }>;
    } = { companyId };
    if (filters?.category && filters.category !== "all")
      where.category = filters.category;
    if (filters?.status) where.status = filters.status;
    if (filters?.dateFrom || filters?.dateTo) {
      where.documentDate = {};
      if (filters.dateFrom) where.documentDate.gte = filters.dateFrom;
      if (filters.dateTo) where.documentDate.lte = filters.dateTo;
    } else if (filters?.startDate || filters?.endDate) {
      where.documentDate = {};
      if (filters.startDate)
        where.documentDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.documentDate.lte = new Date(filters.endDate);
    }
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { documentName: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const [list, total] = await Promise.all([
      prisma.enterpriseEvidenceDocument.findMany({
        where,
        orderBy: { documentDate: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.enterpriseEvidenceDocument.count({ where }),
    ]);
    const data = list.map((d) => ({
      id: d.id,
      documentName: d.documentName,
      category: d.category,
      dateUploaded: d.documentDate,
      status: d.status,
      fileUrl: d.fileUrl,
    }));
    return { data, total, page, limit };
  },

  async getDocument(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
      include: { signature: true },
    });
    return doc;
  },

  async getApprovers(_companyId: string) {
    return [
      { id: "approver-1", name: "John Doe" },
      { id: "approver-2", name: "Jane Smith" },
    ];
  },

  async approveDocument(
    companyId: string,
    documentId: string,
    approverId: string,
    notes?: string,
  ) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    await prisma.enterpriseEvidenceDocument.update({
      where: { id: documentId },
      data: {
        status: "Approved",
        approverId,
        approvedAt: new Date(),
        notes: notes ?? null,
      },
    });
    await prisma.enterpriseDocumentAudit.create({
      data: {
        documentId,
        timestamp: new Date(),
        event: "Document approved",
        userId: approverId,
        ipAddress: null,
      },
    });
    return prisma.enterpriseEvidenceDocument.findUnique({
      where: { id: documentId },
    });
  },

  async rejectDocument(companyId: string, documentId: string, notes?: string) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    await prisma.enterpriseEvidenceDocument.update({
      where: { id: documentId },
      data: {
        status: "Rejected",
        rejectedAt: new Date(),
        notes: notes ?? null,
      },
    });
    return prisma.enterpriseEvidenceDocument.findUnique({
      where: { id: documentId },
    });
  },

  async updateDocumentDetails(
    companyId: string,
    documentId: string,
    data: {
      documentName?: string;
      category?: string;
      documentDate?: Date;
      description?: string;
    },
  ) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    const update: Record<string, unknown> = {};
    if (data.documentName != null) update.documentName = data.documentName;
    if (data.category != null) update.category = data.category;
    if (data.documentDate != null) update.documentDate = data.documentDate;
    if (data.description != null) update.description = data.description;
    if (Object.keys(update).length === 0) return doc;
    await prisma.enterpriseEvidenceDocument.update({
      where: { id: documentId },
      data: update as never,
    });
    return prisma.enterpriseEvidenceDocument.findUnique({
      where: { id: documentId },
    });
  },

  async getSignatureReport(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
      include: {
        signature: true,
        auditTrail: { orderBy: { timestamp: "asc" } },
      },
    });
    if (!doc) return null;
    if (!doc.signature) {
      return {
        documentName: doc.documentName,
        documentType: doc.category,
        signed: false,
        auditTrail: doc.auditTrail.map((a) => ({
          timestamp: a.timestamp,
          event: a.event,
          user: a.userId,
          ipAddress: a.ipAddress,
        })),
      };
    }
    return {
      documentName: doc.signature.documentName,
      documentType: doc.signature.documentType,
      dateSigned: doc.signature.dateSigned,
      signedBy: doc.signature.signedBy,
      signerEmail: doc.signature.signerEmail,
      ipAddress: doc.signature.ipAddress,
      signatureMethod: doc.signature.signatureMethod,
      documentHash: doc.signature.documentHash,
      auditTrail: doc.auditTrail.map((a) => ({
        timestamp: a.timestamp,
        event: a.event,
        user: a.userId,
        ipAddress: a.ipAddress,
      })),
    };
  },

  async deleteDocument(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    await prisma.enterpriseEvidenceDocument.delete({
      where: { id: documentId },
    });
    return { deleted: true };
  },

  async uploadDocument(companyId: string, data: EvidenceVaultUploadInput) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    return prisma.enterpriseEvidenceDocument.create({
      data: {
        companyId,
        documentName: data.documentName,
        category: data.category,
        documentDate: data.documentDate,
        description: data.description ?? null,
        fileUrl: data.fileUrl ?? null,
        fileSizeKb: data.fileSizeKb ?? null,
        status: "Pending",
        uploaderId: data.uploaderId ?? null,
      },
    });
  },

  async getDocumentPreviewUrl(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    return { previewUrl: doc.fileUrl ?? null, documentName: doc.documentName };
  },

  async signDocument(
    companyId: string,
    documentId: string,
    data: EvidenceVaultSignInput,
  ) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    await prisma.enterpriseDocumentSignature.upsert({
      where: { documentId },
      create: {
        documentId,
        documentName: doc.documentName,
        documentType: doc.category,
        dateSigned: new Date(),
        signedBy: data.signedBy,
        signerEmail: data.signerEmail,
        ipAddress: data.ipAddress,
        signatureMethod: data.signatureMethod,
        documentHash: data.documentHash,
        signatureData: data.signatureData ?? null,
      },
      update: {
        documentName: doc.documentName,
        documentType: doc.category,
        dateSigned: new Date(),
        signedBy: data.signedBy,
        signerEmail: data.signerEmail,
        ipAddress: data.ipAddress,
        signatureMethod: data.signatureMethod,
        documentHash: data.documentHash,
        signatureData: data.signatureData ?? null,
      },
    });
    await prisma.enterpriseDocumentAudit.create({
      data: {
        documentId,
        timestamp: new Date(),
        event: "Signature initiated",
        userId: data.signedBy,
        ipAddress: data.ipAddress,
      },
    });
    return prisma.enterpriseDocumentSignature.findUnique({
      where: { documentId },
    });
  },

  /**
   * Placeholder for future OCR / ML extraction. Returns static mock fields
   * shaped like the convert-to-invoice body so clients can pre-fill a form.
   */
  async mockInvoiceExtractionPreview(companyId: string, documentId: string) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    return {
      extractionSource: "mock",
      disclaimer:
        "Structured fields are placeholders. Wire real extraction from the document file later.",
      document: {
        id: doc.id,
        documentName: doc.documentName,
        category: doc.category,
        fileUrl: doc.fileUrl,
      },
      suggestedInvoice: {
        clientName: "Acme Corporation (mock)",
        clientAddress: "100 Mock Road, Victoria Island, Lagos",
        clientEmail: "accounts.payable@example.com",
        totalAmount: 250_750.25,
        lineItems: [
          {
            description: "Consulting services — period placeholder",
            quantity: 1,
            unitPrice: 220_000,
            total: 220_000,
          },
          {
            description: "VAT / adjustments (mock)",
            quantity: 1,
            unitPrice: 30_750.25,
            total: 30_750.25,
          },
        ],
      },
    };
  },

  async convertToInvoice(
    companyId: string,
    documentId: string,
    data: {
      clientName: string;
      clientAddress: string;
      clientEmail: string;
      totalAmount: number;
    },
  ) {
    const doc = await prisma.enterpriseEvidenceDocument.findFirst({
      where: { id: documentId, companyId },
    });
    if (!doc) return null;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) return null;
    const nextNum =
      (company as { nextInvoiceNumber?: number }).nextInvoiceNumber ?? 1;
    const invoiceNumber = String(nextNum);
    await prisma.company.update({
      where: { id: companyId },
      data: { nextInvoiceNumber: nextNum + 1 } as never,
    });
    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);
    const created = await prisma.enterpriseInvoice.create({
      data: {
        companyId,
        invoiceNumber,
        clientName: data.clientName,
        clientAddress: data.clientAddress,
        clientEmail: data.clientEmail,
        dateIssued: now,
        dueDate,
        totalAmount: new Decimal(data.totalAmount),
        notes: `Converted from evidence document: ${doc.documentName}`,
        documentId,
      },
    });
    return enterpriseFinancialsService.getInvoice(companyId, created.id);
  },
};
