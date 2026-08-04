import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { platformMembers, users } from "../src/db/schema";
import { platformRoles, type PlatformRole } from "../src/lib/permissions";

async function main() {
  const email = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
  const requestedRole = process.env.PLATFORM_ADMIN_ROLE?.trim() ?? "super_admin";
  if (!email) throw new Error("Defina PLATFORM_ADMIN_EMAIL.");
  if (!platformRoles.includes(requestedRole as PlatformRole)) {
    throw new Error(`PLATFORM_ADMIN_ROLE inválido: ${requestedRole}`);
  }
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!user) throw new Error("Crie a conta do usuário antes de conceder acesso à plataforma.");
  await db
    .insert(platformMembers)
    .values({ userId: user.id, role: requestedRole as PlatformRole })
    .onConflictDoUpdate({
      target: platformMembers.userId,
      set: { role: requestedRole as PlatformRole, isActive: true, updatedAt: new Date() },
    });
  console.info(`Acesso de plataforma concedido a ${email}: ${requestedRole}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
