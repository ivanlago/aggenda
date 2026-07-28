import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
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
      <body className={`${manrope.variable} min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
