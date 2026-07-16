"use client"

import React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import type { ProductFilter } from "../lib/catalog-filters"
import { buildCategoryFilterHref, filterProducts } from "../lib/catalog-filters"
import type { CatalogProduct, Locale } from "../lib/medusa/contracts"
import { ProductCard } from "./product-card"

const filters: ProductFilter[] = ["all", "featured", "available"]
const filterLabels: Record<ProductFilter, Record<Locale, string>> = { all: { "zh-HK": "全部", en: "All" }, featured: { "zh-HK": "精選", en: "Featured" }, available: { "zh-HK": "現貨產品", en: "Available" } }

export function CategoryProductGrid({ products, locale, initialFilter }: { products: CatalogProduct[]; locale: Locale; initialFilter: ProductFilter }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const visibleProducts = filterProducts(products, initialFilter)
  function selectFilter(value: ProductFilter) { router.replace(buildCategoryFilterHref(pathname, searchParams.toString(), value), { scroll: false }) }
  return <div><div className="filter-row" role="group" aria-label={locale === "zh-HK" ? "產品篩選" : "Product filters"}>{filters.map((value) => <button key={value} type="button" aria-pressed={initialFilter === value} onClick={() => selectFilter(value)}>{filterLabels[value][locale]}</button>)}</div>{visibleProducts.length > 0 ? <div className="product-grid">{visibleProducts.map((product, index) => <ProductCard key={product.handle} product={product} locale={locale} priority={index === 0} />)}</div> : <div className="filter-empty" role="status"><p>{locale === "zh-HK" ? "這個篩選暫時沒有產品。" : "No products match this filter yet."}</p><button type="button" className="button primary" onClick={() => selectFilter("all")}>{locale === "zh-HK" ? "顯示全部" : "Show all"}</button></div>}</div>
}