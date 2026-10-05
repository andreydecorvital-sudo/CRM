import type { Metadata } from "next"
import AppShell from "./app-shell"
import "./globals.css"

export const metadata: Metadata = {
  title: "CRM",
  description: "Atendimento automático + CRM multiempresa",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body><AppShell>{children}</AppShell></body>
    </html>
  )
}
