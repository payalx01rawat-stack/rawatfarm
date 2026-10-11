import "./globals.css"
import { LanguageProvider, LanguageSelector } from "@farmmitra/shared-utils/src/LanguageProvider"

export const metadata = {
  title: "Rawat Farm Delivery",
  description: "Rawat Farm delivery operations.",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><LanguageProvider application="delivery"><div className="fm-language-dock"><LanguageSelector /></div>{children}</LanguageProvider></body></html>
}
