import "dotenv/config";

import { eq } from "drizzle-orm";

import { db } from "../src/db";
import { organizations, whatsappChannels } from "../src/db/schema";

async function main() {
  const organizationId = process.env.WHATSAPP_ORGANIZATION_ID;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

  if (!organizationId || !phoneNumberId) {
    throw new Error(
      "Configure WHATSAPP_ORGANIZATION_ID e META_WHATSAPP_PHONE_NUMBER_ID"
    );
  }

  const [organization] = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (!organization) {
    throw new Error(`Empresa não encontrada: ${organizationId}`);
  }

  const [channel] = await db
    .insert(whatsappChannels)
    .values({
      organizationId,
      phoneNumberId,
      whatsappBusinessAccountId:
        process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || undefined,
      displayPhoneNumber:
        process.env.META_WHATSAPP_DISPLAY_PHONE_NUMBER || undefined,
      isActive: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: whatsappChannels.phoneNumberId,
      set: {
        organizationId,
        whatsappBusinessAccountId:
          process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || undefined,
        displayPhoneNumber:
          process.env.META_WHATSAPP_DISPLAY_PHONE_NUMBER || undefined,
        isActive: true,
        updatedAt: new Date(),
      },
    })
    .returning({ id: whatsappChannels.id });

  console.log(
    `Canal ${channel.id} associado a ${organization.name} (${phoneNumberId})`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
