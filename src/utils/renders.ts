export type ApiResponse<T = unknown> = {
  status: boolean;
  message: string;
  data: T | null;
  errorCode?: string;
};

export const outJson = (
  status: boolean = false,
  message: string = "Nothing to output",
  data: any = null,
  errorCode?: string,
): ApiResponse => ({
  status,
  message,
  data,
  ...(errorCode ? { errorCode } : {}),
});

