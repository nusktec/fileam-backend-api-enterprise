import { Request, Response } from "express";
import { prisma } from "../config/database";
import { sendEmail } from "../services/emailService";

const STATUS_PAGE_HTML = (title: string, message: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Fileam</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 24px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #fff; border-radius: 16px; padding: 40px; max-width: 480px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    h1 { font-size: 24px; color: #1a1a1a; margin-bottom: 16px; }
    p { font-size: 16px; color: #4a4a4a; line-height: 1.6; margin-bottom: 24px; }
    a { display: inline-block; background: #008b8b; color: #fff !important; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <p><strong>Proceed to <a href="https://fileam.app">fileam.app</a></strong></p>
  </div>
</body>
</html>
`;

export async function handleRequestAccept(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  if (!id || !code) {
    res.status(400).send(STATUS_PAGE_HTML("Error", "Invalid request link."));
    return;
  }

  const inv = await prisma.invitation.findFirst({
    where: { id: id!, code: code! },
    include: { consultantUser: true },
  });

  if (!inv || inv.status !== "pending") {
    res.status(400).send(STATUS_PAGE_HTML("Invalid or Expired", "This request is no longer valid or has expired."));
    return;
  }
  if (new Date() > inv.expiresAt) {
    res.status(400).send(STATUS_PAGE_HTML("Expired", "This request has expired."));
    return;
  }
  if (!inv.requestedUserId) {
    res.status(400).send(STATUS_PAGE_HTML("Error", "Invalid request."));
    return;
  }

  const existingActive = await prisma.consultantConnection.findFirst({
    where: { userId: inv.requestedUserId, status: "active" },
  });
  if (existingActive) {
    res.status(400).send(
      STATUS_PAGE_HTML(
        "Already connected",
        "This account already has an active consultant connection.",
      ),
    );
    return;
  }

  const now = new Date();
  const business = await prisma.business.findFirst({
    where: { userId: inv.requestedUserId },
  });
  const user = await prisma.user.findUnique({
    where: { id: inv.requestedUserId },
  });
  const clientCompanyName =
    inv.invitedBusinessName?.trim() ||
    business?.name ||
    user?.organizationName ||
    (user ? `${user.firstName} ${user.lastName}`.trim() : "") ||
    user?.email ||
    "Client";

  let clientCompany = await prisma.company.findFirst({
    where: {
      ownerId: inv.consultantUserId,
      linkedUserId: inv.requestedUserId,
    },
  });
  if (!clientCompany) {
    clientCompany = await prisma.company.create({
      data: {
        name: clientCompanyName,
        ownerId: inv.consultantUserId,
        linkedUserId: inv.requestedUserId,
        managedByCompanyId: null,
      },
    });
  }

  await prisma.$transaction([
    prisma.consultantConnection.create({
      data: {
        consultantUserId: inv.consultantUserId,
        userId: inv.requestedUserId,
        invitationId: inv.id,
        acceptedAt: now,
        consultantTermsAccepted: true,
        status: "active",
      },
    }),
    prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "accepted" },
    }),
  ]);

  const clientName =
    user?.organizationName ?? business?.name ?? user?.email ?? "A client";

  if (inv.initiator === "client_to_consultant") {
    if (user?.email) {
      await sendEmail(
        user.email,
        "Consultant accepted your request - Fileam",
        `<p>Your request to connect with your tax professional on Fileam was accepted. You can continue in the app.</p><p><a href="https://fileam.app">Open Fileam</a></p>`,
      );
    }
    res.send(
      STATUS_PAGE_HTML(
        "Request accepted",
        "You have accepted this connection request. The client has been notified.",
      ),
    );
    return;
  }

  const consultantUser = await prisma.user.findUnique({
    where: { id: inv.consultantUserId },
    select: { email: true },
  });
  if (consultantUser?.email) {
    await sendEmail(
      consultantUser.email,
      "Client accepted your invitation - Fileam",
      `<p>${clientName} has accepted your invitation to connect on Fileam.</p><p><a href="https://fileam.app">Go to Fileam</a></p>`,
    );
  }

  res.send(
    STATUS_PAGE_HTML(
      "Invitation accepted",
      "You have successfully accepted this invitation. You can now proceed to the app.",
    ),
  );
}

export async function handleRequestDecline(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  if (!id || !code) {
    res.status(400).send(STATUS_PAGE_HTML("Error", "Invalid request link."));
    return;
  }

  const inv = await prisma.invitation.findFirst({
    where: { id: id!, code: code! },
    include: { requestedUser: { select: { email: true } } },
  });

  if (!inv || inv.status !== "pending") {
    res.send(STATUS_PAGE_HTML("Already Processed", "This request has already been processed."));
    return;
  }

  await prisma.invitation.update({
    where: { id: inv.id },
    data: { status: "rejected" },
  });

  if (inv.initiator === "client_to_consultant" && inv.requestedUser?.email) {
    await sendEmail(
      inv.requestedUser.email,
      "Consultant declined your request - Fileam",
      `<p>Your connection request on Fileam was declined. You can try inviting another professional from the app.</p><p><a href="https://fileam.app">Open Fileam</a></p>`,
    );
  }

  res.send(
    STATUS_PAGE_HTML(
      "Request declined",
      inv.initiator === "client_to_consultant"
        ? "You have declined this connection request. The client has been notified."
        : "You have declined this invitation.",
    ),
  );
}
