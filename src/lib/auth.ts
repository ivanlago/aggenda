import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import * as schema from "@/db/schema";
import { sendPasswordResetEmail } from "@/lib/email";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean) as string[],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    usePlural: true,
  }),
  databaseHooks: {
    session: {
      create: {
        after: async (session) => {
          try {
            await db.update(schema.users)
              .set({ lastSignedInAt: sql`greatest(${schema.users.lastSignedInAt}, ${session.createdAt.toISOString()}::timestamptz AT TIME ZONE 'UTC')` })
              .where(eq(schema.users.id, session.userId));
          } catch {
            console.error("[auth] Não foi possível registrar o horário da última entrada.");
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: 24 * 60 * 60,
    sendResetPassword: async ({ user, url, token }) => {
      await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        url,
        token,
      });
    },
    onPasswordReset: async ({ user }) => {
      await db
        .update(schema.users)
        .set({ mustChangePassword: false, updatedAt: new Date() })
        .where(eq(schema.users.id, user.id));
    },
  },
  socialProviders:
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            prompt: "select_account",
          },
        }
      : undefined,
});
