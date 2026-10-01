export type ReturnOverride = { mode: "default" | "custom" | "disabled"; date?: string };

export function validReturnDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function returnDate(performedDate: string, interval: number | null, unit: string, override?: ReturnOverride) {
  if (!validReturnDate(performedDate)) throw new Error("Data de realização inválida.");
  if (override?.mode === "disabled") return null;
  if (override?.mode === "custom") {
    if (!override.date || !validReturnDate(override.date) || override.date <= performedDate) throw new Error("A data de retorno deve ser posterior à realização do procedimento.");
    return override.date;
  }
  if (interval === null) return null;
  if (!Number.isInteger(interval) || interval < 1 || interval > 3650 || !["days", "months"].includes(unit)) throw new Error("Prazo de retorno inválido.");
  const date = new Date(`${performedDate}T12:00:00Z`);
  if (unit === "days") date.setUTCDate(date.getUTCDate() + interval);
  else {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + interval);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  }
  return date.toISOString().slice(0, 10);
}

export function reminderDate(dueDate: string, days: number) {
  const date = new Date(`${dueDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function procedureReturnState(dueDate: string, reminderDays: number, contactStatus: string, today: string, scheduled: boolean) {
  if (scheduled) return "scheduled";
  if (contactStatus === "dismissed") return "dismissed";
  if (contactStatus === "contacted") return "contacted";
  if (dueDate < today) return "overdue";
  return reminderDate(dueDate, reminderDays) <= today ? "upcoming" : "future";
}

export function serviceReturnSettings(data: FormData) {
  const raw = String(data.get("returnInterval") ?? "").trim();
  const interval = raw ? Number(raw) : null;
  const unit = String(data.get("returnIntervalUnit") ?? "days");
  const reminder = Number(data.get("returnReminderDays") ?? 7);
  if ((interval !== null && (!Number.isInteger(interval) || interval < 1 || interval > 3650)) || !["days", "months"].includes(unit) || !Number.isInteger(reminder) || reminder < 0 || reminder > 365) throw new Error("Revise o prazo de retorno e a antecedência (0 a 365 dias).");
  return { returnInterval: interval, returnIntervalUnit: unit, returnReminderDays: reminder };
}

export function parseReturnOverrides(data: FormData): Record<string, ReturnOverride> {
  const result: Record<string, ReturnOverride> = {};
  for (const [key, value] of data.entries()) {
    if (!key.startsWith("returnMode:")) continue;
    const id = key.slice(11);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["default", "custom", "disabled"].includes(String(value))) throw new Error("Opção de retorno inválida.");
    const mode = String(value) as ReturnOverride["mode"];
    const date = String(data.get(`returnDate:${id}`) ?? "");
    if (mode === "custom" && !validReturnDate(date)) throw new Error("Informe uma data de retorno válida.");
    result[id] = { mode, ...(mode === "custom" ? { date } : {}) };
  }
  return result;
}
