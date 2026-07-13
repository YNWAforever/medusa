"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import React, { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import type { Locale } from "../lib/medusa/contracts"
import type { CheckoutView, FulfillmentInput, ShippingOptionView } from "../lib/medusa/checkout"
import { formatCatalogMoney } from "../lib/catalog-filters"
import { localeHref } from "../lib/locales"

type CheckoutSeed = Pick<CheckoutView, "cart" | "shippingOptions" | "paymentProviderId"> & Partial<Pick<CheckoutView, "customer" | "fulfillment" | "stage" | "blockers">>

type ContactState = {
  email: string
  firstName: string
  lastName: string
  phone: string
  address1: string
  address2: string
  city: string
  postalCode: string
}

const emptyContact: ContactState = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  postalCode: "",
}

function normalizeCheckout(value: CheckoutSeed): CheckoutView {
  return {
    customer: null,
    fulfillment: null,
    stage: "contact",
    blockers: [],
    ...value,
  }
}

function initialContact(checkout: CheckoutView | null): ContactState {
  return { ...emptyContact, email: checkout?.cart.email ?? "" }
}

function optionReason(option: ShippingOptionView, locale: Locale): string {
  if (option.reasonCode === "retail_out_of_stock") return locale === "zh-HK" ? "零售庫存不足" : "Retail item is out of stock"
  if (option.reasonCode === "print_not_supported") return locale === "zh-HK" ? "此分店不支援所選服務" : "This branch does not support the selected service"
  return locale === "zh-HK" ? "暫時無法選擇" : "Currently unavailable"
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json()
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function CheckoutFlow({ locale, initialCheckout }: { locale: Locale; initialCheckout?: CheckoutSeed }) {
  const router = useRouter()
  const [checkout, setCheckout] = useState<CheckoutView | null>(() => initialCheckout ? normalizeCheckout(initialCheckout) : null)
  const [stage, setStage] = useState<CheckoutView["stage"]>(() => initialCheckout?.stage ?? "contact")
  const [contact, setContact] = useState<ContactState>(() => initialContact(initialCheckout ? normalizeCheckout(initialCheckout) : null))
  const [selectedKind, setSelectedKind] = useState<"delivery" | "pickup">(initialCheckout?.fulfillment?.kind ?? (initialCheckout?.stage === "fulfillment" ? "pickup" : "delivery"))
  const [selectedOptionId, setSelectedOptionId] = useState(initialCheckout?.fulfillment?.shippingOptionId ?? "")
  const [selectedBranchHandle, setSelectedBranchHandle] = useState(initialCheckout?.fulfillment?.kind === "pickup" ? initialCheckout.fulfillment.branchHandle : null)
  const [isLoading, setIsLoading] = useState(!initialCheckout)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (initialCheckout) return
    const controller = new AbortController()
    void fetch("/api/checkout?locale=" + encodeURIComponent(locale), { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const body = await readJson(response)
        if (!response.ok || !body.checkout) {
          setError(typeof body.error === "object" && body.error !== null ? String((body.error as Record<string, unknown>).code ?? "checkout_unavailable") : "checkout_unavailable")
          return
        }
        const next = normalizeCheckout(body.checkout as CheckoutSeed)
        setCheckout(next)
        setStage(next.stage)
        setSelectedKind(next.fulfillment?.kind ?? "delivery")
        setSelectedOptionId(next.fulfillment?.shippingOptionId ?? "")
        setSelectedBranchHandle(next.fulfillment?.kind === "pickup" ? next.fulfillment.branchHandle : null)
      })
      .catch((requestError: unknown) => {
        if (!(requestError instanceof DOMException && requestError.name === "AbortError")) setError("checkout_unavailable")
      })
      .finally(() => setIsLoading(false))
    return () => controller.abort()
  }, [initialCheckout, locale])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  const options = checkout?.shippingOptions ?? []
  const selectedOption = useMemo(() => options.find((option) => option.id === selectedOptionId), [options, selectedOptionId])

  function updateContactField(field: keyof ContactState, value: string) {
    setContact((current) => ({ ...current, [field]: value }))
  }

  async function post(path: string, body?: unknown): Promise<Record<string, unknown>> {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const result = await readJson(response)
    if (!response.ok) {
      const code = typeof result.error === "object" && result.error !== null ? String((result.error as Record<string, unknown>).code ?? "checkout_unavailable") : "checkout_unavailable"
      throw new Error(code)
    }
    return result
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      const address = selectedKind === "delivery"
        ? { address1: contact.address1, address2: contact.address2 || null, city: contact.city, postalCode: contact.postalCode, countryCode: "hk" }
        : null
      const result = await post("/api/checkout/contact", { ...contact, address })
      if (checkout && result.cart) setCheckout((current) => current ? { ...current, cart: result.cart as CheckoutView["cart"] } : current)
      setStage("fulfillment")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "checkout_unavailable")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function submitFulfillment() {
    if (!checkout || !selectedOption || !selectedOption.compatible || isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      const input: FulfillmentInput = selectedKind === "pickup"
        ? { kind: "pickup", shippingOptionId: selectedOption.id, branchHandle: selectedBranchHandle ?? "" }
        : { kind: "delivery", shippingOptionId: selectedOption.id, branchHandle: null }
      const result = await post("/api/checkout/fulfillment?locale=" + encodeURIComponent(locale), input)
      const selected = result.result as { cart?: CheckoutView["cart"]; fulfillment?: CheckoutView["fulfillment"] } | undefined
      if (selected?.cart) setCheckout((current) => current ? { ...current, cart: selected.cart ?? current.cart, fulfillment: selected.fulfillment ?? current.fulfillment } : current)
      setStage("review")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "checkout_unavailable")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function initializePayment() {
    if (isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await post("/api/checkout/payment")
      setStage("payment")
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "payment_session_failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function completeOrder() {
    if (isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      await post("/api/checkout/complete?locale=" + encodeURIComponent(locale))
      router.replace(localeHref(locale, "/checkout/confirmation"))
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "checkout_unavailable")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <main id="main-content" className="page-shell checkout-page" data-checkout-flow={stage}><p role="status">{locale === "zh-HK" ? "正在載入結帳資料" : "Loading checkout"}</p></main>
  if (!checkout) return <main id="main-content" className="page-shell checkout-page" data-checkout-flow={stage}><p className="eyebrow">{locale === "zh-HK" ? "購物車" : "Cart"}</p><h1>{locale === "zh-HK" ? "購物車暫時無法結帳" : "Checkout is unavailable"}</h1><Link className="button primary" href={localeHref(locale, "/")}>{locale === "zh-HK" ? "返回購物" : "Back to shopping"}</Link></main>

  const labels = locale === "zh-HK"
    ? { heading: "結帳", contact: "聯絡資料", fulfillment: "選擇取貨方式", review: "確認訂單", payment: "付款", email: "電郵地址", firstName: "名字", lastName: "姓氏", phone: "電話", address1: "地址", address2: "地址第二行", city: "地區", postalCode: "郵政編碼", delivery: "香港送貨", pickup: "門市取貨", continueFulfillment: "繼續選擇取貨方式", continueReview: "檢查訂單", continuePayment: "繼續付款", complete: "完成訂單", paymentNote: "付款由 Fotomax 系統處理，現階段不會進行外部扣款。", orderSummary: "訂單摘要", subtotal: "小計", shipping: "運費", total: "總額" }
    : { heading: "Checkout", contact: "Contact details", fulfillment: "Choose fulfillment", review: "Review order", payment: "Payment", email: "Email", firstName: "First name", lastName: "Last name", phone: "Phone", address1: "Address", address2: "Address line 2", city: "City", postalCode: "Postal code", delivery: "Hong Kong delivery", pickup: "Store pickup", continueFulfillment: "Continue to fulfillment", continueReview: "Review order", continuePayment: "Continue to payment", complete: "Complete order", paymentNote: "Payment is handled by the Fotomax system; no external charge is made at this stage.", orderSummary: "Order summary", subtotal: "Subtotal", shipping: "Shipping", total: "Total" }

  return (
    <main id="main-content" className="page-shell checkout-page" data-checkout-flow={stage}>
      <div className="checkout-heading"><p className="eyebrow">Fotomax</p><h1>{labels.heading}</h1></div>
      <ol className="checkout-stepper" aria-label={labels.heading}>
        {(["contact", "fulfillment", "review", "payment"] as const).map((step, index) => <li className={stage === step ? "active" : ""} key={step}><span>{index + 1}</span>{labels[step]}</li>)}
      </ol>
      {error ? <div className="checkout-error" role="alert" aria-live="polite" tabIndex={-1} ref={errorRef}><strong>{locale === "zh-HK" ? "暫時未能完成要求" : "We could not continue"}</strong><p>{error}</p></div> : null}
      {stage === "contact" ? (
        <form className="checkout-section checkout-form" onSubmit={submitContact}>
          <h2>{labels.contact}</h2>
          <div className="checkout-name-grid"><label>{labels.firstName}<input value={contact.firstName} onChange={(event) => updateContactField("firstName", event.target.value)} autoComplete="given-name" required /></label><label>{labels.lastName}<input value={contact.lastName} onChange={(event) => updateContactField("lastName", event.target.value)} autoComplete="family-name" required /></label></div>
          <label>{labels.email}<input type="email" value={contact.email} onChange={(event) => updateContactField("email", event.target.value)} autoComplete="email" required /></label>
          <label>{labels.phone}<input type="tel" value={contact.phone} onChange={(event) => updateContactField("phone", event.target.value)} autoComplete="tel" required /></label>
          <div className="checkout-address-grid"><label>{labels.address1}<input value={contact.address1} onChange={(event) => updateContactField("address1", event.target.value)} autoComplete="street-address" required={selectedKind === "delivery"} /></label><label>{labels.address2}<input value={contact.address2} onChange={(event) => updateContactField("address2", event.target.value)} autoComplete="address-line2" /></label><label>{labels.city}<input value={contact.city} onChange={(event) => updateContactField("city", event.target.value)} autoComplete="address-level2" required={selectedKind === "delivery"} /></label><label>{labels.postalCode}<input value={contact.postalCode} onChange={(event) => updateContactField("postalCode", event.target.value)} autoComplete="postal-code" required={selectedKind === "delivery"} /></label></div>
          <OrderSummary checkout={checkout} labels={labels} locale={locale} /><button className="button primary wide" disabled={isSubmitting} type="submit">{isSubmitting ? "Working..." : labels.continueFulfillment}</button>
        </form>
      ) : null}
      {stage === "fulfillment" ? (
        <section className="checkout-section" aria-labelledby="fulfillment-heading"><h2 id="fulfillment-heading">{labels.fulfillment}</h2><div className="checkout-segmented" role="group" aria-label={labels.fulfillment}><button className={selectedKind === "delivery" ? "selected" : ""} type="button" onClick={() => setSelectedKind("delivery")}>{labels.delivery}</button><button className={selectedKind === "pickup" ? "selected" : ""} type="button" onClick={() => setSelectedKind("pickup")}>{labels.pickup}</button></div><div className="checkout-options">{options.filter((option) => option.kind === selectedKind).map((option) => <label className={"checkout-option" + (option.compatible ? "" : " disabled") } key={option.id}><input type="radio" name="shippingOption" value={option.id} checked={selectedOptionId === option.id} disabled={!option.compatible} onChange={() => { setSelectedOptionId(option.id); setSelectedBranchHandle(option.branchHandle) }} /><span><strong>{option.label}</strong><small>{option.description} · {formatCatalogMoney(option.price, locale)}</small>{option.stagingLabel ? <small className="staging-label">{option.stagingLabel}</small> : null}{!option.compatible ? <small className="option-reason">{optionReason(option, locale)} ({option.reasonCode})</small> : null}</span></label>)}</div><button className="button primary" disabled={isSubmitting || !selectedOption?.compatible} type="button" onClick={() => void submitFulfillment()}>{isSubmitting ? "Working..." : labels.continueReview}</button></section>
      ) : null}
      {stage === "review" ? <section className="checkout-section" aria-labelledby="review-heading"><h2 id="review-heading">{labels.review}</h2><OrderSummary checkout={checkout} labels={labels} locale={locale} /><button className="button primary" disabled={isSubmitting} type="button" onClick={() => void initializePayment()}>{isSubmitting ? "Working..." : labels.continuePayment}</button></section> : null}
      {stage === "payment" ? <section className="checkout-section" aria-labelledby="payment-heading"><h2 id="payment-heading">{labels.payment}</h2><p className="checkout-payment-note">{labels.paymentNote}</p><OrderSummary checkout={checkout} labels={labels} locale={locale} /><button className="button primary" disabled={isSubmitting} type="button" onClick={() => void completeOrder()}>{isSubmitting ? "Working..." : labels.complete}</button></section> : null}
    </main>
  )
}

function OrderSummary({ checkout, labels, locale }: { checkout: CheckoutView; labels: Record<string, string>; locale: Locale }) {
  return <div className="checkout-summary"><h3>{labels.orderSummary}</h3><dl><div><dt>{labels.subtotal}</dt><dd>{formatCatalogMoney(checkout.cart.subtotal, locale)}</dd></div><div><dt>{labels.shipping}</dt><dd>{formatCatalogMoney(checkout.cart.shippingTotal, locale)}</dd></div><div><dt>{labels.total}</dt><dd>{formatCatalogMoney(checkout.cart.total, locale)}</dd></div></dl></div>
}
