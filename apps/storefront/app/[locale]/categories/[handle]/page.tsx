import { notFound } from "next/navigation"
import type { Locale } from "@/lib/medusa/contracts"
import { CategoryPage } from "@/components/category-page"
import { getCatalogView, getCategoryView, parseProductFilter } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export default async function CategoryRoute({ params, searchParams }: {
  params: Promise<{ locale: string; handle: string }>
  searchParams: Promise<{ filter?: string | string[] }>
}) {
  const [{ locale: localeParam, handle }, { filter }] = await Promise.all([params, searchParams])
  const locale: Locale = assertLocale(localeParam)
  const [categories, initialFilter] = await Promise.all([getCatalogView(locale), parseProductFilter(filter)])
  const view = getCategoryView(categories, handle)

  if (!view) {
    notFound()
  }

  return <CategoryPage category={view.category} products={view.products} locale={locale} initialFilter={initialFilter} />
}