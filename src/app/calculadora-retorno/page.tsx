import { Calculator } from "lucide-react";

import { ReturnCalculator } from "./return-calculator";

export const metadata = { title: "Calculadora de precificação · Aggenda" };

export default function ReturnCalculatorPage() {
  return <main className="grid min-h-screen place-items-center bg-[#f3f5f1] p-5"><section className="panel w-full max-w-3xl"><div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-accent text-brand-dark"><Calculator className="size-5" /></span><div><p className="text-xs font-extrabold uppercase tracking-widest text-brand">Ferramenta gratuita</p><h1 className="text-2xl font-extrabold">Precifique seu procedimento</h1></div></div><p className="mt-4 text-sm leading-6 text-muted">Considere insumos, tempo, comissão, taxas e margem para estimar um preço sustentável. Os valores ficam apenas no seu navegador.</p><ReturnCalculator /><p className="mt-6 text-center text-xs text-muted">Criado com Aggenda · agenda, relacionamento e pagamentos em um só lugar</p></section></main>;
}
