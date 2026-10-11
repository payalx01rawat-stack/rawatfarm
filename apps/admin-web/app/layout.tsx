import "./globals.css"
import { LanguageProvider, LanguageSelector } from "@farmmitra/shared-utils/src/LanguageProvider"
import { AdminRoleGate } from "./components/AdminRoleGate"

export const metadata = {
  title: "Rawat Farm Admin",
  description: "Rawat Farm business operations.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body><LanguageProvider application="admin"><AdminRoleGate><div className="fm-language-dock"><LanguageSelector /></div>{children}</AdminRoleGate></LanguageProvider></body>
    </html>
  )
}
