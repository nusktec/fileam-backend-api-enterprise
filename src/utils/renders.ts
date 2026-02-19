export type ApiResponse<T = unknown> = {
  status: boolean;
  message: string;
  data: T | null;
};

export const outJson = (
  status: boolean = false,
  message: string = "Nothing to output",
  data: any = null
): ApiResponse => ({
  status,
  message,
  data,
});

