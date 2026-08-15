"use client";

import { useState } from "react";

export function AppointmentSelfService({ token, status }: { token: string; status: string }) {
  const [currentStatus, setCurrentStatus] = useState(status); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  async function update(action: "confirm" | "cancel") { setLoading(true); setMessage(""); const response = await fetch(`/api/public/appointments/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }); const result = await response.json(); setLoading(false); if (!response.ok) return setMessage(result.error); setCurrentStatus(result.status); setMessage(action === "confirm" ? "Agendamento confirmado." : "Agendamento cancelado."); }
  if (["cancelled", "completed", "no_show"].includes(currentStatus)) return <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm font-bold">Este agendamento não aceita mais alterações.</p>;
  return <div className="mt-5"><p className="text-sm text-muted">Você pode confirmar sua presença ou cancelar. Para escolher outro horário, cancele e faça um novo agendamento pela página da empresa.</p><div className="mt-4 flex flex-wrap gap-3">{currentStatus !== "confirmed" && <button className="primary-button" disabled={loading} onClick={() => update("confirm")}>Confirmar presença</button>}<button className="secondary-button text-red-700" disabled={loading} onClick={() => update("cancel")}>Cancelar agendamento</button></div>{message && <p className="mt-3 rounded-xl bg-[#edf7f1] p-3 text-sm font-bold text-brand" role="status">{message}</p>}</div>;
}
