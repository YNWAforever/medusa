import { notFound } from "next/navigation"
import type { Locale } from "@fotomax/shared"
import { CategoryPage } from "@/components/category-page"
import { getCategoryView, parseProductFilter } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export default async function CategoryRoute({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; handle: string }>
  searchParams: Promise<{ filter?: string | string[] }>
}) {
  const [{ locale: localeParam, handle }, { filter }] = await Promise.all([params, searchParams])
  const locale: Locale = assertLocale(localeParam)
  const view = getCategoryView(handle)
  const initialFilter = parseProductFilter(filter)

  if (!view) {
    notFound()
  }

  return (
    <CategoryPage
      category={view.category}
      products={view.products}
      locale={locale}
      initialFilter={initialFilter}
    />
  )
}
