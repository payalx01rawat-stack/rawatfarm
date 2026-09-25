import "./globals.css"

export const metadata = {
  title: "FarmMitra Delivery",
  description: "FarmMitra delivery partner operations",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
