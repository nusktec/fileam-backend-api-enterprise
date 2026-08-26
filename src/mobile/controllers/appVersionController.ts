import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import type { AppPlatform } from "../../constants/appVersion";
import { appVersionService } from "../services/appVersionService";

export const getAppVersion = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const query = matchedData(req, {
      locations: ["query"],
      includeOptionals: true,
    }) as { platform?: AppPlatform; version?: string };

    const data = query.platform
      ? appVersionService.checkVersion(query.platform, query.version)
      : appVersionService.checkAll(query.version);

    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "App version policy retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve app version policy", null));
  }
};
