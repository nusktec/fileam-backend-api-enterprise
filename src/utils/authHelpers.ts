import { IRequest } from "../interfaces/CustomRequest";

export function getAuthUserId(req: IRequest): string {
  return (req.user as NonNullable<IRequest["user"]>).id;
}
