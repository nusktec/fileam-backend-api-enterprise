import { prisma } from "../../config/database";
import { HttpReplyError } from "../../utils/httpReplyError";
import { HttpStatusCode } from "../../interfaces/system";

const BOOLEAN_FIELDS = [
  "autoExportOn",
  "missingEvidence",
  "uncategorised",
  "unknownCounterparty",
  "unusualAmounts",
  "unmatchedPayments",
] as const;

const ALLOWED_FIELDS = new Set<string>([...BOOLEAN_FIELDS, "defaultNote"]);

type BooleanField = (typeof BOOLEAN_FIELDS)[number];

export type AutoExportSettings = {
  autoExportOn: boolean;
  missingEvidence: boolean;
  uncategorised: boolean;
  unknownCounterparty: boolean;
  unusualAmounts: boolean;
  unmatchedPayments: boolean;
  defaultNote: string;
};

export type AutoExportConsultant = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationName: string | null;
  phone: string | null;
};

const DEFAULTS: AutoExportSettings = {
  autoExportOn: false,
  missingEvidence: true,
  uncategorised: false,
  unknownCounterparty: false,
  unusualAmounts: true,
  unmatchedPayments: false,
  defaultNote: "",
};

function fail(statusCode: number, message: string): never {
  throw new HttpReplyError(statusCode, message);
}

export const transactionAssistantService = {
  async consultantPerson(userId: string): Promise<AutoExportConsultant | null> {
    const conn = await prisma.consultantConnection.findFirst({
      where: { userId, status: "active" },
      include: {
        consultant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            organizationName: true,
            phone: true,
          },
        },
      },
    });
    if (!conn?.consultant) return null;
    const person = conn.consultant;
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      email: person.email,
      organizationName: person.organizationName ?? null,
      phone: person.phone ?? null,
    };
  },

  async get(userId: string) {
    const [consultant, row] = await Promise.all([
      this.consultantPerson(userId),
      prisma.transactionAssistantAutoExport.findUnique({ where: { userId } }),
    ]);
    return {
      consultant,
      ...(row
        ? {
            autoExportOn: row.autoExportOn,
            missingEvidence: row.missingEvidence,
            uncategorised: row.uncategorised,
            unknownCounterparty: row.unknownCounterparty,
            unusualAmounts: row.unusualAmounts,
            unmatchedPayments: row.unmatchedPayments,
            defaultNote: row.defaultNote,
          }
        : DEFAULTS),
    };
  },

  async update(userId: string, body: unknown) {
    if (body == null || typeof body !== "object" || Array.isArray(body)) {
      fail(HttpStatusCode.BAD_REQUEST, "Body fails validation");
    }
    const input = body as Record<string, unknown>;
    const keys = Object.keys(input);
    for (const key of keys) {
      if (!ALLOWED_FIELDS.has(key)) {
        fail(HttpStatusCode.BAD_REQUEST, "Body fails validation");
      }
    }

    const patch: Partial<AutoExportSettings> = {};
    for (const field of BOOLEAN_FIELDS) {
      if (input[field] === undefined) continue;
      if (typeof input[field] !== "boolean") {
        fail(HttpStatusCode.BAD_REQUEST, `${field} must be a boolean`);
      }
      patch[field as BooleanField] = input[field] as boolean;
    }
    if (input.defaultNote !== undefined) {
      if (typeof input.defaultNote !== "string") {
        fail(HttpStatusCode.BAD_REQUEST, "defaultNote must be a string");
      }
      if (input.defaultNote.length > 500) {
        fail(
          HttpStatusCode.BAD_REQUEST,
          "defaultNote must be at most 500 characters",
        );
      }
      patch.defaultNote = input.defaultNote;
    }

    const business = await prisma.business.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!business) {
      fail(
        HttpStatusCode.FORBIDDEN,
        "User cannot update this business",
      );
    }

    if (patch.autoExportOn === true) {
      const consultant = await this.consultantPerson(userId);
      if (!consultant) {
        fail(
          HttpStatusCode.BAD_REQUEST,
          "autoExportOn cannot be true when no consultant is assigned",
        );
      }
    }

    const current = await prisma.transactionAssistantAutoExport.findUnique({
      where: { userId },
    });
    const next = {
      autoExportOn: patch.autoExportOn ?? current?.autoExportOn ?? DEFAULTS.autoExportOn,
      missingEvidence:
        patch.missingEvidence ?? current?.missingEvidence ?? DEFAULTS.missingEvidence,
      uncategorised:
        patch.uncategorised ?? current?.uncategorised ?? DEFAULTS.uncategorised,
      unknownCounterparty:
        patch.unknownCounterparty ??
        current?.unknownCounterparty ??
        DEFAULTS.unknownCounterparty,
      unusualAmounts:
        patch.unusualAmounts ?? current?.unusualAmounts ?? DEFAULTS.unusualAmounts,
      unmatchedPayments:
        patch.unmatchedPayments ??
        current?.unmatchedPayments ??
        DEFAULTS.unmatchedPayments,
      defaultNote: patch.defaultNote ?? current?.defaultNote ?? DEFAULTS.defaultNote,
    };

    await prisma.transactionAssistantAutoExport.upsert({
      where: { userId },
      create: { userId, ...next },
      update: next,
    });

    return this.get(userId);
  },
};
