export function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedDate(date: string, time: string, timezone: string) {
  const desired = new Date(`${date}T${time}:00Z`);
  let result = new Date(desired);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = zonedParts(result, timezone);
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute)
    );
    result = new Date(result.getTime() + desired.getTime() - represented);
  }
  return result;
}

export function parseOrganizationDateTime(value: string, timezone: string) {
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(value);
  return local ? zonedDate(local[1], local[2], timezone) : new Date(value);
}

export function organizationDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date);
}

export function formatOrganizationDateTime(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
    timeZone: timezone,
  }).format(date);
}

export function organizationDayRange(date: Date, timezone: string) {
  const localDate = organizationDate(date, timezone);
  const [year, month, day] = localDate.split("-").map(Number);
  const nextLocalDate = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);
  return {
    start: zonedDate(localDate, "00:00", timezone),
    end: zonedDate(nextLocalDate, "00:00", timezone),
  };
}

