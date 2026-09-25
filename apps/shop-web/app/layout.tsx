import "./globals.css"

export const metadata = {
  title: "FarmMitra Shop",
  description: "FarmMitra Shop Ordering Portal",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
