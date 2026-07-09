import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Fotomax Modern Storefront",
  description: "A modern bilingual Fotomax commerce storefront foundation.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-HK">
      <body>{children}</body>
    </html>
  )
}
