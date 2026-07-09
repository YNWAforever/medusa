import { notFound } from "next/navigation"
import type { Locale } from "@fotomax/shared"
import { CategoryPage } from "@/components/category-page"
import { getCategoryView } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export default async function CategoryRoute({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { locale: localeParam, handle } = await params
  const locale: Locale = assertLocale(localeParam)
  const view = getCategoryView(handle)

  if (!view) {
    notFound()
  }

  return <CategoryPage category={view.category} products={view.products} locale={locale} />
}
