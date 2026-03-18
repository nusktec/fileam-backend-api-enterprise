import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { getAuthUserId } from "../../utils/authHelpers";
import { contactsAndTypesService } from "../../services/contactsAndTypesService";

export async function getContactsAndTypes(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const userId = getAuthUserId(req);
    const [contacts, types] = await Promise.all([
      contactsAndTypesService.getContactsForMobile(userId),
      Promise.resolve(contactsAndTypesService.getAllTypes()),
    ]);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Contacts and types", { contacts, types }));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get contacts and types", null));
  }
}
