import { notFound } from "next/navigation"
import type { Locale } from "@fotomax/shared"
import { ProductDetail } from "@/components/product-detail"
import { getProductView } from "@/lib/catalog-view"
import { assertLocale } from "@/lib/locales"

export default async function ProductRoute({ params }: { params: Promise<{ locale: string; handle: string }> }) {
  const { locale: localeParam, handle } = await params
  const locale: Locale = assertLocale(localeParam)
  const view = getProductView(handle)

  if (!view) {
    notFound()
  }

  return <ProductDetail product={view.product} category={view.category} locale={locale} />
}
