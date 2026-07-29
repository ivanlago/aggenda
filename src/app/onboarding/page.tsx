import { Building2, CalendarCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { createOrganization } from "@/actions/app";
import { getCurrentOrganization, requireSession } from "@/lib/session";

export const metadata = { title: "Configure seu negócio" };

export default async function OnboardingPage() {
  const session = await requireSession();
  if (await getCurrentOrganization(session.user.id)) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-xl rounded-[2rem] border bg-white p-8 shadow-xl shadow-brand/5 sm:p-10">
        <div className="flex items-center gap-3 font-extrabold text-brand">
          <CalendarCheck className="size-6" /> Aggenda
        </div>
        <div className="mt-8 grid size-14 place-items-center rounded-2xl bg-[#edf7f1] text-brand">
          <Building2 />
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">
          Conte um pouco sobre seu negócio
        </h1>
        <p className="mt-3 text-muted">
          Criaremos seu espaço de trabalho. Você poderá ajustar tudo depois.
        </p>
        <form action={createOrganization} className="mt-8 grid gap-5">
          <label className="grid gap-2 text-sm font-bold">
            Nome do negócio
            <input className="field" name="name" required minLength={2} placeholder="Ex.: Studio Aurora" />
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Segmento
            <select className="field" name="businessType" defaultValue="">
              <option value="">Selecione</option>
              <option value="saude">Saúde e clínicas</option>
              <option value="estetica">Estética</option>
              <option value="salao">Salão</option>
              <option value="barbearia">Barbearia</option>
              <option value="juridico">Jurídico</option>
              <option value="oficina">Oficina</option>
              <option value="escritorio">Escritório</option>
              <option value="outro">Outro</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-bold">
            Telefone
            <input className="field" name="phone" type="tel" placeholder="(71) 99999-9999" />
          </label>
          <button className="mt-2 rounded-2xl bg-brand px-5 py-4 font-extrabold text-white hover:bg-brand-dark">
            Criar meu espaço
          </button>
        </form>
      </div>
    </main>
  );
}
