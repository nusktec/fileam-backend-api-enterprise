import { IRequest } from "../interfaces/CustomRequest";

/**
 * Use only on routes protected by authenticate() middleware.
 * Returns the current user's id; req.user is guaranteed by auth middleware.
 */
export function getAuthUserId(req: IRequest): string {
  return (req.user as NonNullable<IRequest["user"]>).id;
}
