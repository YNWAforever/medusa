"use client"

import React, { useState } from "react"
import type { Locale, Product } from "@fotomax/shared"
import { filterProducts, type ProductFilter } from "../lib/catalog-view"
import { ProductCard } from "./product-card"

const filters: ProductFilter[] = ["all", "featured", "available"]

const filterLabels: Record<ProductFilter, Record<Locale, string>> = {
  all: { "zh-HK": "全部", en: "All" },
  featured: { "zh-HK": "精選", en: "Featured" },
  available: { "zh-HK": "現貨產品", en: "Available" },
}

export function CategoryProductGrid({ products, locale }: { products: Product[]; locale: Locale }) {
  const [filter, setFilter] = useState<ProductFilter>("all")
  const visibleProducts = filterProducts(products, filter)

  return (
    <div>
      <div className="filter-row" role="group" aria-label={locale === "zh-HK" ? "產品篩選" : "Product filters"}>
        {filters.map((value) => (
          <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {filterLabels[value][locale]}
          </button>
        ))}
      </div>
      {visibleProducts.length > 0 ? (
        <div className="product-grid">
          {visibleProducts.map((product) => (
            <ProductCard key={product.handle} product={product} locale={locale} />
          ))}
        </div>
      ) : (
        <div className="filter-empty" role="status">
          <p>{locale === "zh-HK" ? "這個篩選暫時沒有產品。" : "No products match this filter yet."}</p>
          <button type="button" className="button primary" onClick={() => setFilter("all")}>
            {locale === "zh-HK" ? "顯示全部" : "Show all"}
          </button>
        </div>
      )}
    </div>
  )
}
