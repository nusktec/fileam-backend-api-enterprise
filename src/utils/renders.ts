export const outJson = (
  status: boolean = false,
  message: string = "Nothing to output",
  data: any = []
) => ({
  status,
  message,
  data,
});

