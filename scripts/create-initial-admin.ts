import "dotenv/config";

import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import {
  organizationMembers,
  organizations,
  users,
} from "../src/db/schema";
import { auth } from "../src/lib/auth";

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  const name = process.env.INITIAL_ADMIN_NAME?.trim() || "Administrador";
  const organizationName =
    process.env.INITIAL_ADMIN_ORGANIZATION?.trim() || "Aggenda Administração";

  if (!email || !password || password.length < 8) {
    throw new Error(
      "Defina INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD (mínimo de 8 caracteres)."
    );
  }

  let [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
    });
    user = { id: result.user.id };
  }

  const [membership] = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, user.id))
    .limit(1);

  if (!membership) {
    await db.transaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({
          name: organizationName,
          slug: `administracao-${crypto.randomUUID().slice(0, 8)}`,
          businessType: "administracao",
        })
        .returning({ id: organizations.id });

      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId: user.id,
        role: "owner",
      });
    });
  } else {
    await db
      .update(organizationMembers)
      .set({ role: "owner" })
      .where(eq(organizationMembers.userId, user.id));
  }

  const signedIn = await auth.api.signInEmail({
    body: { email, password },
  });
  if (signedIn.user.id !== user.id) {
    throw new Error("A validação das credenciais do administrador falhou.");
  }

  console.info(`Administrador inicial pronto: ${email}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
