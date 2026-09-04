"use server";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";

export async function resendAccessActivation() {
  const session = await requireSession();
  const [user] = await db
    .select({ email: users.email, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user?.mustChangePassword) {
    return { warning: "Sua senha já foi definida. Você pode acessar o painel." };
  }

  try {
    await auth.api.requestPasswordReset({
      body: {
        email: user.email,
        redirectTo: `/redefinir-senha?primeiroAcesso=1&email=${encodeURIComponent(user.email)}`,
      },
    });
    return { warning: "Novo link enviado. Verifique também a pasta de spam." };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "Falha ao reenviar ativação de acesso",
      userId: session.user.id,
      error: error instanceof Error ? error.message : String(error),
    }));
    return { error: "Não foi possível enviar o e-mail agora. Aguarde alguns minutos e tente novamente." };
  }
}
