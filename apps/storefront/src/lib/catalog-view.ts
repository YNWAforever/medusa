import { unstable_cache } from "next/cache"
import type { CatalogCategory, Locale } from "./medusa/contracts"
import { getCatalogCategories } from "./medusa/catalog"
export { buildCategoryFilterHref, filterProducts, formatCatalogMoney, getCategoryView, getProductView, parseProductFilter, type CategoryView, type ProductFilter, type ProductView } from "./catalog-filters"

export const CATALOG_REVALIDATE_SECONDS = 60
const getCachedCatalogCategories = unstable_cache(async (locale: Locale) => getCatalogCategories(locale), ["storefront-catalog"], { revalidate: CATALOG_REVALIDATE_SECONDS, tags: ["catalog"] })
export async function getCatalogView(locale: Locale): Promise<CatalogCategory[]> { return getCachedCatalogCategories(locale) }