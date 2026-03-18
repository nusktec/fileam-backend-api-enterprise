import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import {
  sendResult,
  sendBadRequest,
  sendServerError,
} from "../utils/controllerHelpers";
import { contactsAndTypesService } from "../../services/contactsAndTypesService";

export async function getContactsAndTypes(
  req: IRequest,
  res: Response,
): Promise<void> {
  const consultantUserId = req.user?.id;
  if (!consultantUserId) {
    sendBadRequest(res, "Authentication required.");
    return;
  }
  try {
    const [contacts, types] = await Promise.all([
      contactsAndTypesService.getContactsForEnterprise(consultantUserId),
      Promise.resolve(contactsAndTypesService.getAllTypes()),
    ]);
    sendResult(res, "Contacts and types", { contacts, types });
  } catch {
    sendServerError(res, "Failed to get contacts and types");
  }
}
