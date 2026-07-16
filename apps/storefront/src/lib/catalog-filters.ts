import type { CatalogCategory, CatalogProduct, Locale, MoneyView } from "./medusa/contracts"

export interface CategoryView { category: CatalogCategory; products: CatalogProduct[] }
export interface ProductView { product: CatalogProduct; category: CatalogCategory }
export type ProductFilter = "all" | "featured" | "available"
const productFilters: ProductFilter[] = ["all", "featured", "available"]

export function parseProductFilter(value: string | string[] | undefined): ProductFilter { return typeof value === "string" && productFilters.includes(value as ProductFilter) ? value as ProductFilter : "all" }
export function buildCategoryFilterHref(pathname: string, currentSearch: string, filter: ProductFilter): string { const searchParams = new URLSearchParams(currentSearch); if (filter === "all") searchParams.delete("filter"); else searchParams.set("filter", filter); const query = searchParams.toString(); return query ? `${pathname}?${query}` : pathname }
function publishedProducts(products: CatalogProduct[]) { return products.filter((product) => product.commerceMode !== "deferred") }
export function filterProducts(products: CatalogProduct[], filter: ProductFilter): CatalogProduct[] { const visibleProducts = publishedProducts(products); if (filter === "all") return visibleProducts; if (filter === "available") return visibleProducts.filter((product) => product.variants.some((variant) => variant.inventory.available)); return visibleProducts.filter((product) => product.badge !== null) }
export function getCategoryView(categories: CatalogCategory[], handle: string): CategoryView | undefined { const category = categories.find((candidate) => candidate.handle === handle); return category ? { category, products: filterProducts(category.products, "all") } : undefined }
export function getProductView(categories: CatalogCategory[], handle: string): ProductView | undefined { for (const category of categories) { const product = filterProducts(category.products, "all").find((candidate) => candidate.handle === handle); if (product) return { product, category } } return undefined }
export function formatCatalogMoney(money: MoneyView | undefined, locale: Locale): string { if (!money) return locale === "zh-HK" ? "價格待定" : "Price unavailable"; return new Intl.NumberFormat(locale === "zh-HK" ? "zh-HK" : "en-HK", { style: "currency", currency: money.currencyCode.toUpperCase() }).format(money.amount / 100) }