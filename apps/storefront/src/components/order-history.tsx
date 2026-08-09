"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import React, { useEffect, useState } from "react"
import type { OrderView } from "../lib/medusa/auth"
import type { Locale } from "../lib/medusa/contracts"
import { formatCatalogMoney } from "../lib/catalog-filters"
import { localeHref } from "../lib/locales"
import { useOptionalCart } from "./cart-provider"

export type OrderHistoryState =
  | { status: "loading" }
  | { status: "expired" }
  | { status: "error" }
  | { status: "ready"; orders: OrderView[] }

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function OrderHistoryView({ locale, state }: { locale: Locale; state: OrderHistoryState }) {
  const isZh = locale === "zh-HK"
  if (state.status === "loading") return <p role="status">{isZh ? "正在載入你的訂單" : "Loading your orders"}</p>
  if (state.status === "expired") {
    return <div className="account-state"><h2>{isZh ? "登入時段已過期" : "Your session has expired"}</h2><Link className="button primary" href={localeHref(locale, "/account/login")}>{isZh ? "重新登入" : "Sign in again"}</Link></div>
  }
  if (state.status === "error") return <p role="status">{isZh ? "暫時未能載入訂單，請稍後再試。" : "We could not load your orders. Please try again later."}</p>
  if (state.orders.length === 0) return <div className="account-state"><h2>{isZh ? "暫未有訂單" : "You have no orders yet"}</h2><Link className="button primary" href={localeHref(locale, "/")}>{isZh ? "開始選購" : "Start shopping"}</Link></div>

  return <ul className="order-list">{state.orders.map((order) => (
    <li className="order-row" key={order.id}>
      <div><strong>#{order.displayId}</strong><span>{new Intl.DateTimeFormat(isZh ? "zh-HK" : "en-HK", { dateStyle: "medium" }).format(new Date(order.createdAt))}</span></div>
      <strong>{formatCatalogMoney(order.total, locale)}</strong>
      <span>{titleCase(order.status)}</span>
      <span>{titleCase(order.fulfillmentStatus)}</span>
    </li>
  ))}</ul>
}

export function OrderHistory({ locale }: { locale: Locale }) {
  const router = useRouter()
  const cart = useOptionalCart()
  const [state, setState] = useState<OrderHistoryState>({ status: "loading" })

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/account/orders", { credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const body: { orders?: OrderView[] } = await response.json()
        if (response.status === 401) {
          setState({ status: "expired" })
        } else if (!response.ok || !Array.isArray(body.orders)) {
          setState({ status: "error" })
        } else {
          setState({ status: "ready", orders: body.orders })
        }
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ status: "error" })
      })
    return () => controller.abort()
  }, [])

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" })
    // Logout drops the cart cookie too, so pull the now-empty cart into the
    // drawer rather than leaving the signed-out customer's lines on screen.
    await cart?.refresh()
    router.replace(localeHref(locale, "/account/login"))
    router.refresh()
  }

  return (
    <section className="order-history" aria-labelledby="order-history-heading">
      <div className="section-heading split">
        <h1 id="order-history-heading">{locale === "zh-HK" ? "你的訂單" : "Your orders"}</h1>
        <button className="button secondary" type="button" onClick={() => void signOut()}>
          {locale === "zh-HK" ? "登出" : "Sign out"}
        </button>
      </div>
      <OrderHistoryView locale={locale} state={state} />
    </section>
  )
}
