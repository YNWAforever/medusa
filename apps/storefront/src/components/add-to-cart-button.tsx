"use client"
import React from "react"
import { ShoppingBag } from "lucide-react"
import { t } from "@fotomax/shared"
import type { CatalogProduct, Locale } from "../lib/medusa/contracts"
import { useOptionalCart } from "./cart-provider"
export function AddToCartButton({ product, locale }: { product: CatalogProduct; locale: Locale }) { const cart = useOptionalCart(); const quantity = cart?.items.find((item) => item.product.handle === product.handle)?.quantity ?? 0; const command = quantity === 0 ? t(locale, "addToCart") : locale === "zh-HK" ? "再加一件" : "Add another"; const feedback = quantity === 0 ? "" : locale === "zh-HK" ? `已加入購物車，數量 ${quantity}` : `Added to cart, ${quantity} ${quantity === 1 ? "item" : "items"}`; return <><button className="button primary wide" type="button" disabled={!cart} onClick={() => cart?.addItem(product)}><ShoppingBag size={18} aria-hidden="true" /><span>{command}</span></button><span className="cart-command-status" role="status" aria-live="polite" aria-atomic="true">{feedback}</span></> }