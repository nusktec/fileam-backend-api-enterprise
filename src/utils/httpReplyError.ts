/** Throw from services when the controller should map to a non-500 HTTP status. */
export class HttpReplyError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpReplyError";
  }
}
