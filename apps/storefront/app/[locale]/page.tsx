import type { Locale } from "@/lib/medusa/contracts"
import { HomePage } from "@/components/home-page"
import { getCatalogView } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export const dynamic = "force-dynamic"

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)
  const categories = await getCatalogView(locale)

  return <HomePage locale={locale} categories={categories} />
}