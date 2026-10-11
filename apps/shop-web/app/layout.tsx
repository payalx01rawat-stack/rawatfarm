import "./globals.css"
import { LanguageProvider, LanguageSelector } from "@farmmitra/shared-utils/src/LanguageProvider"

export const metadata = {
  title: "Rawat Farm Shop",
  description: "Order fresh products from Rawat Farm.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body><LanguageProvider application="shop"><div className="fm-language-dock"><LanguageSelector /></div>{children}</LanguageProvider></body>
    </html>
  )
}
