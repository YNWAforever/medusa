import { CheckCircle2, Store } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { formatCatalogMoney } from "../lib/catalog-filters"
import type { CatalogCategory, CatalogProduct, Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"
import { AddToCartButton } from "./add-to-cart-button"

export function ProductDetail({ product, category, locale }: { product: CatalogProduct; category: CatalogCategory; locale: Locale }) {
  const selectedVariant = product.variants.find((variant) => variant.inventory.available) ?? product.variants[0]
  const options = new Map<string, string[]>()
  for (const variant of product.variants) for (const option of variant.options) options.set(option.name, [...new Set([...(options.get(option.name) ?? []), option.value])])
  return <main id="main-content" className="page-shell product-detail"><div className="product-gallery">{product.thumbnail ? <Image className="product-detail-image" src={product.thumbnail} alt={product.title} fill priority loading="eager" fetchPriority="high" sizes="(max-width: 920px) 100vw, 60vw" /> : <div className="product-image-placeholder" aria-hidden="true" />}</div><section className="product-info"><Link className="text-link" href={localeHref(locale, `/categories/${category.handle}`)}>{category.title}</Link>{product.badge ? <span className="badge">{product.badge}</span> : null}<h1>{product.title}</h1><p>{product.description}</p><strong className="price">{formatCatalogMoney(selectedVariant?.price, locale)}</strong><p className="option-note">{locale === "zh-HK" ? "以下選項只供參考；網上訂購即將推出。" : "Options are shown for reference; online ordering is coming soon."}</p>{options.size > 0 ? <section className="option-stack" aria-labelledby="product-details-heading"><h2 id="product-details-heading">{locale === "zh-HK" ? "產品資料" : "Product details"}</h2><dl className="option-list">{Array.from(options).map(([name, values]) => <div className="option-group" key={name}><dt>{name}</dt><dd><ul className="option-values">{values.map((value) => <li key={value}>{value}</li>)}</ul></dd></div>)}</dl></section> : null}<p className="availability-note">{selectedVariant?.inventory.available ? <AddToCartButton product={product} locale={locale} /> : (locale === "zh-HK" ? "Out of stock" : "Out of stock")}</p><div className="detail-notes"><p><Store size={18} aria-hidden="true" />{locale === "zh-HK" ? "門市取貨詳情即將推出。" : "Store pickup details are coming soon."}</p><p><CheckCircle2 size={18} aria-hidden="true" />{locale === "zh-HK" ? "所有價格均以港幣顯示。" : "All prices are shown in Hong Kong dollars."}</p></div></section></main>
}