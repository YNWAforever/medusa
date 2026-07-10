import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { localeLabels, locales, type Locale } from "@fotomax/shared"
import { CartDrawer } from "@/components/cart-drawer"
import { CartProvider } from "@/components/cart-provider"
import { SiteHeader } from "@/components/site-header"
import { assertLocale } from "@/lib/locales"
import "../globals.css"

export const metadata: Metadata = {
  title: "Fotomax Modern Storefront",
  description: "A modern bilingual Fotomax commerce storefront foundation.",
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale: localeParam } = await params
  let locale: Locale

  try {
    locale = assertLocale(localeParam)
  } catch {
    notFound()
  }

  return (
    <html lang={locale}>
      <body>
        <CartProvider>
          <div data-locale={locale} aria-label={localeLabels[locale]}>
            <a className="skip-link" href="#main-content">
              {locale === "zh-HK" ? "跳至主要內容" : "Skip to main content"}
            </a>
            <SiteHeader locale={locale} />
            {children}
            <CartDrawer locale={locale} />
          </div>
        </CartProvider>
      </body>
    </html>
  )
}
