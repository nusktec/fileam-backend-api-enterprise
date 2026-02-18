/**
 * Creates a standardized JSON response format for API endpoints
 * @param status - Boolean indicating success or failure
 * @param message - Descriptive message about the operation result
 * @param data - Data payload to include in the response
 * @returns object - Standardized response object with status, message, and data
 */
export const outJson = (
  status: boolean = false,
  message: string = "Nothing to output",
  data: any = []
) => ({
  status,
  message,
  data,
});

