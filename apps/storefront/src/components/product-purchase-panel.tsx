"use client"

import Link from "next/link"
import React, { useEffect, useMemo, useState } from "react"
import type { BranchView } from "../lib/medusa/branches"
import type { CatalogProduct, CatalogVariant, Locale } from "../lib/medusa/contracts"
import { formatCatalogMoney } from "../lib/catalog-filters"
import { localeHref } from "../lib/locales"
import { AddToCartButton } from "./add-to-cart-button"
import { useOptionalCart } from "./cart-provider"

export type BranchAvailabilityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; branches: BranchView[] }

function optionId(name: string, index: number): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return "purchase-option-" + (slug || "option") + "-" + (index + 1)
}

function optionGroups(product: CatalogProduct): Array<{ name: string; values: string[] }> {
  const groups = new Map<string, string[]>()
  for (const variant of product.variants) {
    for (const option of variant.options) {
      groups.set(option.name, [...new Set([...(groups.get(option.name) ?? []), option.value])])
    }
  }
  return Array.from(groups, ([name, values]) => ({ name, values }))
}

export function selectVariantForOption(
  product: CatalogProduct,
  currentVariantId: string,
  optionName: string,
  optionValue: string,
): CatalogVariant {
  const current = product.variants.find((variant) => variant.id === currentVariantId)
    ?? product.variants[0]
  if (!current) {
    throw new Error("Product has no variants")
  }

  const selections = new Map(current.options.map((option) => [option.name, option.value]))
  selections.set(optionName, optionValue)
  return product.variants.find((variant) =>
    Array.from(selections).every(([name, value]) =>
      variant.options.some((option) => option.name === name && option.value === value),
    ),
  ) ?? current
}

export function isOptionValueAvailable(
  product: CatalogProduct,
  currentVariantId: string,
  optionName: string,
  optionValue: string,
): boolean {
  return selectVariantForOption(product, currentVariantId, optionName, optionValue).options
    .some((option) => option.name === optionName && option.value === optionValue)
}

export function BranchAvailability({
  locale,
  state,
}: {
  locale: Locale
  state: BranchAvailabilityState
}) {
  if (state.status === "idle") return null
  if (state.status === "loading") {
    return <p className="branch-status" role="status">
      {locale === "zh-HK" ? "正在查詢測試取貨資料" : "Checking staging pickup availability"}
    </p>
  }
  if (state.status === "error") {
    return <p className="branch-status error" role="status">
      {locale === "zh-HK"
        ? "暫時未能載入測試取貨資料，請稍後再試。"
        : "Staging pickup data is temporarily unavailable. Please try again later."}
    </p>
  }
  if (state.branches.length === 0) {
    return <p className="branch-status">
      {locale === "zh-HK" ? "此購物車暫無測試取貨選項。" : "No staging pickup options are available for this cart."}
    </p>
  }

  return (
    <section className="branch-availability" aria-labelledby="branch-availability-heading">
      <h3 id="branch-availability-heading">
        {locale === "zh-HK" ? "測試門市取貨狀況" : "Staging pickup availability"}
      </h3>
      <ul className="branch-list">
        {state.branches.map((branch) => (
          <li className="branch-item" key={branch.id}>
            <div>
              <strong>{branch.name}</strong>
              <span>{branch.district}</span>
            </div>
            {branch.stagingLabel ? <span className="staging-label">{branch.stagingLabel}</span> : null}
            <span className={branch.compatible ? "availability available" : "availability unavailable"}>
              {branch.compatible
                ? locale === "zh-HK" ? "此購物車可於此取貨" : "Available for this cart"
                : locale === "zh-HK" ? "此購物車暫不可於此取貨" : "Unavailable for this cart"}
            </span>
            <span>
              {locale === "zh-HK"
                ? `預計 ${branch.leadTimeBusinessDays} 個工作天`
                : `Estimated ${branch.leadTimeBusinessDays} business days`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ProductPurchasePanel({
  product,
  locale,
  photoPrintEnabled,
  initialVariantId,
}: {
  product: CatalogProduct
  locale: Locale
  photoPrintEnabled: boolean
  initialVariantId?: string
}) {
  const initialVariant = product.variants.find((variant) => variant.id === initialVariantId)
    ?? product.variants.find((variant) => variant.inventory.available)
    ?? product.variants[0]
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariant?.id ?? "")
  const selectedVariant = product.variants.find((variant) => variant.id === selectedVariantId)
    ?? initialVariant
  const groups = useMemo(() => optionGroups(product), [product])
  const cart = useOptionalCart()
  const cartId = cart?.cart.id ?? null
  const cartSignature = cart?.cart.items
    .map((item) => item.id + ":" + item.quantity)
    .sort()
    .join("|") ?? ""
  const refreshCart = cart?.refresh
  const [branchState, setBranchState] = useState<BranchAvailabilityState>(
    cartId && product.commerceMode === "retail" ? { status: "loading" } : { status: "idle" },
  )

  useEffect(() => {
    if (!cartId || product.commerceMode !== "retail") {
      setBranchState({ status: "idle" })
      return
    }

    const controller = new AbortController()
    setBranchState({ status: "loading" })
    void (async () => {
      try {
        const response = await fetch(
          `/api/branches?cartId=${encodeURIComponent(cartId)}&locale=${encodeURIComponent(locale)}`,
          { credentials: "same-origin", signal: controller.signal },
        )
        if (response.status === 410) {
          setBranchState({ status: "idle" })
          await refreshCart?.()
          return
        }

        const body: unknown = await response.json()
        if (
          !response.ok
          || typeof body !== "object"
          || body === null
          || !Reflect.has(body, "branches")
          || !Array.isArray(Reflect.get(body, "branches"))
        ) {
          throw new Error("branch_unavailable")
        }
        setBranchState({
          status: "ready",
          branches: Reflect.get(body, "branches") as BranchView[],
        })
      } catch (error: unknown) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setBranchState({ status: "error" })
        }
      }
    })()

    return () => controller.abort()
  }, [cartId, cartSignature, locale, product.commerceMode, refreshCart])

  if (!selectedVariant) {
    return <p className="availability-note">{locale === "zh-HK" ? "暫無產品選項" : "No product options available"}</p>
  }

  return (
    <section className="product-purchase-panel" aria-labelledby="purchase-options-heading">
      <h2 id="purchase-options-heading">
        {locale === "zh-HK" ? "選擇產品款式" : "Choose your option"}
      </h2>
      {groups.length > 0 ? (
        <div className="purchase-options">
          {groups.map(({ name, values }, index) => {
            const id = optionId(name, index)
            const value = selectedVariant.options.find((option) => option.name === name)?.value
              ?? values[0]
            return (
              <div className="purchase-option" key={name}>
                <label htmlFor={id}>{name}</label>
                <select
                  id={id}
                  value={value}
                  onChange={(event) => {
                    setSelectedVariantId(
                      selectVariantForOption(
                        product,
                        selectedVariant.id,
                        name,
                        event.currentTarget.value,
                      ).id,
                    )
                  }}
                >
                  {values.map((optionValue) => (
                    <option
                      disabled={!isOptionValueAvailable(product, selectedVariant.id, name, optionValue)}
                      key={optionValue}
                      value={optionValue}
                    >
                      {optionValue}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      ) : null}
      <strong className="price">{formatCatalogMoney(selectedVariant.price, locale)}</strong>
      {product.commerceMode === "retail" ? (
        <>
          <p className="availability-note">
            {selectedVariant.inventory.available
              ? locale === "zh-HK" ? "有貨" : "In stock"
              : locale === "zh-HK" ? "缺貨" : "Out of stock"}
          </p>
          <AddToCartButton product={product} locale={locale} variantId={selectedVariant.id} />
          <BranchAvailability locale={locale} state={branchState} />
        </>
      ) : product.commerceMode === "photo_print" ? (
        photoPrintEnabled ? (
          <Link className="button primary wide" href={localeHref(locale, "/services/photo-print/editor")}>
            {locale === "zh-HK" ? "開始相片沖印" : "Start photo print"}
          </Link>
        ) : (
          <p className="availability-note">
            {locale === "zh-HK" ? "相片沖印網上落單暫未開放。" : "Photo print ordering is not available yet."}
          </p>
        )
      ) : (
        <p className="availability-note">
          {locale === "zh-HK" ? "此產品暫未開放網上訂購。" : "This product is not available for online ordering yet."}
        </p>
      )}
    </section>
  )
}
