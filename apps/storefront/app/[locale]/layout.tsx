import { localeLabels, locales, type Locale } from "@fotomax/shared"
import { notFound } from "next/navigation"
import { assertLocale } from "@/lib/locales"

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
    <div lang={locale} data-locale={locale} aria-label={localeLabels[locale]}>
      {children}
    </div>
  )
}
