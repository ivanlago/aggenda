export const DEFAULT_PAGE_SIZE = 20;
export function parseListPage(value: unknown) {
  if (typeof value !== "string" || !/^\d{1,7}$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
export function listPageHref(path: string, query: Record<string, string | undefined>, page: number, parameter = "pagina") {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value && key !== parameter) params.set(key, value);
  if (page > 1) params.set(parameter, String(page));
  const search = params.toString();
  return `${path}${search ? `?${search}` : ""}`;
}
