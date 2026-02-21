import { prisma } from "../../config/database";
import type { EvidenceVaultUploadInput, EvidenceVaultSignInput } from "../../interfaces/enterprise/evidenceVault";

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

  async getCategoriesWithCounts(companyId: string) {
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

  async getRecentDocuments(companyId: string, limit = 10) {
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
      usedGb: Math.round(usedGb * 100) / 100,
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
    },
    opts?: { page?: number; limit?: number; sortOrder?: "ASC" | "DESC" },
  ) {
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
    if (filters?.startDate || filters?.endDate) {
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
};
