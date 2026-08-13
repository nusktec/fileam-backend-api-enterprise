/** Throw from services when the controller should map to a non-500 HTTP status. */
export class HttpReplyError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly data: unknown = null,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = "HttpReplyError";
  }
}
