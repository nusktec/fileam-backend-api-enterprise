import { prisma } from "../../config/database";

export type ClientBusinessProfileUpdate = {
  businessName?: string;
  rcNumber?: string;
  tin?: string;
  industry?: string;
  turnoverBand?: string;
  vatStatus?: string;
};

export type ClientContactUpdate = {
  address?: string;
  city?: string;
  email?: string;
  phone?: string;
  website?: string;
};

export const clientBusinessProfileService = {
  async updateBusinessProfile(linkedUserId: string, data: ClientBusinessProfileUpdate) {
    let business = await prisma.business.findFirst({
      where: { userId: linkedUserId },
    });
    const updateData: Record<string, unknown> = {};
    if (data.businessName !== undefined) updateData.name = data.businessName;
    if (data.rcNumber !== undefined) updateData.rcNumber = data.rcNumber;
    if (data.tin !== undefined) updateData.tin = data.tin;
    if (data.industry !== undefined) updateData.sector = data.industry;
    if (data.turnoverBand !== undefined) updateData.turnoverBand = data.turnoverBand;
    if (data.vatStatus !== undefined) updateData.vatStatus = data.vatStatus;

    if (business) {
      return prisma.business.update({
        where: { id: business.id },
        data: updateData,
      });
    }
    const user = await prisma.user.findUnique({
      where: { id: linkedUserId },
      select: { id: true },
    });
    if (!user) return null;
    return prisma.business.create({
      data: {
        userId: linkedUserId,
        name: (data.businessName as string) ?? "Business",
        incomeType: "business",
        taxObligationsUnderstoodAndAccepted: false,
        rcNumber: data.rcNumber ?? null,
        tin: data.tin ?? null,
        sector: data.industry ?? null,
        turnoverBand: data.turnoverBand ?? null,
        vatStatus: data.vatStatus ?? null,
      },
    });
  },

  async updateContact(linkedUserId: string, data: ClientContactUpdate) {
    const user = await prisma.user.findUnique({
      where: { id: linkedUserId },
    });
    if (!user) return null;

    let business = await prisma.business.findFirst({
      where: { userId: linkedUserId },
    });

    const businessData: Record<string, unknown> = {};
    if (data.address !== undefined) businessData.streetAddress = data.address;
    if (data.city !== undefined) businessData.city = data.city;
    if (data.website !== undefined) businessData.website = data.website;
    if (data.email !== undefined) businessData.contactEmail = data.email;

    const userData: Record<string, unknown> = {};
    if (data.phone !== undefined) userData.phone = data.phone;
    if (data.address !== undefined) userData.address = data.address;

    if (Object.keys(userData).length > 0) {
      await prisma.user.update({
        where: { id: linkedUserId },
        data: userData,
      });
    }

    if (Object.keys(businessData).length > 0) {
      if (business) {
        await prisma.business.update({
          where: { id: business.id },
          data: businessData,
        });
      } else {
        business = await prisma.business.create({
          data: {
            userId: linkedUserId,
            name: "Business",
            incomeType: "business",
            taxObligationsUnderstoodAndAccepted: false,
            streetAddress: (data.address as string) ?? null,
            city: (data.city as string) ?? null,
            website: (data.website as string) ?? null,
            contactEmail: (data.email as string) ?? null,
          },
        });
      }
    }

    const [updatedUser, updatedBusiness] = await Promise.all([
      prisma.user.findUnique({
        where: { id: linkedUserId },
        select: { email: true, phone: true, address: true },
      }),
      prisma.business.findFirst({
        where: { userId: linkedUserId },
        select: {
          streetAddress: true,
          city: true,
          website: true,
          contactEmail: true,
        },
      }),
    ]);
    return {
      email: updatedBusiness?.contactEmail ?? updatedUser?.email ?? null,
      phone: updatedUser?.phone ?? null,
      address: updatedBusiness?.streetAddress ?? updatedUser?.address ?? null,
      city: updatedBusiness?.city ?? null,
      website: updatedBusiness?.website ?? null,
    };
  },
};
