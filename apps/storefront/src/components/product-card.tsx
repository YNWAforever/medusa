import { ShoppingBag } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import React from "react"
import { formatCatalogMoney } from "../lib/catalog-filters"
import type { CatalogProduct, Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"

export function ProductCard({ product, locale, priority = false }: { product: CatalogProduct; locale: Locale; priority?: boolean }) {
  const pricedVariant = product.variants.find((variant) => variant.inventory.available) ?? product.variants[0]
  return <article className="product-card"><Link href={localeHref(locale, `/products/${product.handle}`)} className="product-image" aria-label={locale === "zh-HK" ? `查看${product.title}` : `View ${product.title}`}>{product.thumbnail ? <Image src={product.thumbnail} alt="" fill priority={priority} loading={priority ? "eager" : undefined} fetchPriority={priority ? "high" : undefined} sizes="(max-width: 920px) 100vw, 25vw" /> : <span className="product-image-placeholder" aria-hidden="true" />}</Link><div className="product-card-body">{product.badge ? <span className="badge">{product.badge}</span> : null}<h3><Link href={localeHref(locale, `/products/${product.handle}`)}>{product.title}</Link></h3><p>{product.description}</p><div className="product-card-footer"><strong>{formatCatalogMoney(pricedVariant?.price, locale)}</strong><ShoppingBag size={18} aria-hidden="true" /></div></div></article>
}