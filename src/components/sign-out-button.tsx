"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() =>
        authClient.signOut({
          fetchOptions: { onSuccess: () => router.push("/") },
        })
      }
      className="flex items-center gap-2 text-sm font-bold text-white/70 hover:text-white"
      aria-label="Sair"
    >
      <LogOut className="size-4" /> {!compact && "Sair"}
    </button>
  );
}
