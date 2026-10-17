import { organizationDate, parseOrganizationDateTime } from "./organization-time";

export function agendaRange(date: string | undefined, period: string | undefined, timezone: string, now = new Date()) {
  const valid = date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  const anchor = valid ? date : organizationDate(now, timezone);
  const view = period === "day" || period === "week" ? period : "month";
  const end = new Date(`${anchor}T12:00:00Z`);
  if (view === "month") {
    const day = end.getUTCDate();
    end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 2); end.setUTCDate(0);
    end.setUTCDate(Math.min(day, end.getUTCDate()));
  } else end.setUTCDate(end.getUTCDate() + (view === "week" ? 7 : 1));
  const endDate = end.toISOString().slice(0, 10);
  return { anchor, period: view, start: parseOrganizationDateTime(`${anchor}T00:00`, timezone), end: parseOrganizationDateTime(`${endDate}T00:00`, timezone) };
}
