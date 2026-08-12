/** Throw from services when the controller should map to a non-500 HTTP status. */
export class HttpReplyError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly data: unknown = null,
  ) {
    super(message);
    this.name = "HttpReplyError";
  }
}
