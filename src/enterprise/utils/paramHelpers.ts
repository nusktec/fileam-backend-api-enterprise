export function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function getParam(
  params: Record<string, string | string[] | undefined>,
  name: string,
): string {
  return paramString(params[name]);
}
