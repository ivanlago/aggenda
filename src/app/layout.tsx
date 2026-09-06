import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";
import { PhoneMaskProvider } from "@/components/phone-mask-provider";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.aggenda.app.br"),
  title: {
    default: "Aggenda — Seu negócio em movimento",
    template: "%s | Aggenda",
  },
  description:
    "Agenda, clientes, serviços e equipe em um só lugar. Feito para negócios que vivem de atendimento.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${jakarta.variable} min-h-screen antialiased`}>
        <PhoneMaskProvider />
        {children}
      </body>
    </html>
  );
}
