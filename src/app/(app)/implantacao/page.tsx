import { redirect } from "next/navigation";
import { requireOrganization } from "@/lib/session";
export default async function ImplantationPage() {
  const { organization } = await requireOrganization();
  redirect(organization.role === "professional" ? "/dashboard" : "/configuracoes?aba=onboarding");
}
