import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { helpService } from "../services/helpService";

export const getFaqs = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const category = req.query.category as string | undefined;
    const data = helpService.getFaqs(category);
    res.status(HttpStatusCode.OK).json(outJson(true, "FAQs retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve FAQs", null));
  }
};

export const getAbout = async (_req: IRequest, res: Response): Promise<void> => {
  try {
    const data = helpService.getAbout();
    res.status(HttpStatusCode.OK).json(outJson(true, "About retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve about", null));
  }
};

export const submitContact = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const { subject, message } = req.body ?? {};
    const data = helpService.submitContact(userId, subject ?? "", message ?? "");
    res.status(HttpStatusCode.OK).json(outJson(true, data.message, data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit contact", null));
  }
};
