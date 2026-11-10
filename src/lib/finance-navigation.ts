export type FinanceSearchParams = Record<string, string | string[] | undefined>;

export const launchesPath = "/financeiro/lancamentos";
export const onlineChargesPath = launchesPath + "?aba=receber&visao=cobrancas";

export function financeQuery(searchParams: FinanceSearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") query.set(key, value);
  }
  return query;
}

export function launchesUrl(query: URLSearchParams) {
  const search = query.toString();
  return search ? launchesPath + "?" + search : launchesPath;
}

export function financeMonth(value: string | undefined, today: string) {
  return value && value < "9999-12" && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value) ? value : today.slice(0, 7);
}

export function nextFinanceMonth(month: string) {
  const next = new Date(month + "-01T12:00:00Z");
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next.toISOString().slice(0, 7);
}
