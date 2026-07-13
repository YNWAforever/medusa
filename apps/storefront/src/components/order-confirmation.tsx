"use client"

import Link from "next/link"
import React, { useEffect, useState } from "react"
import type { Locale } from "../lib/medusa/contracts"
import type { OrderConfirmationView } from "../lib/medusa/checkout"
import { formatCatalogMoney } from "../lib/catalog-filters"
import { localeHref } from "../lib/locales"

export function OrderConfirmation({ locale }: { locale: Locale }) {
  const [confirmation, setConfirmation] = useState<OrderConfirmationView | null>(null)
  const [status, setStatus] = useState<"loading" | "ready" | "expired">("loading")

  useEffect(() => {
    void fetch("/api/checkout/confirmation", { credentials: "same-origin" })
      .then(async (response) => {
        const body: { confirmation?: OrderConfirmationView } = await response.json()
        if (!response.ok || !body.confirmation) {
          setStatus("expired")
          return
        }
        setConfirmation(body.confirmation)
        setStatus("ready")
      })
      .catch(() => setStatus("expired"))
  }, [])

  if (status === "loading") return <main id="main-content" className="page-shell confirmation-page"><p role="status">{locale === "zh-HK" ? "正在載入訂單確認" : "Loading your order confirmation"}</p></main>
  if (!confirmation) return <main id="main-content" className="page-shell confirmation-page"><p className="eyebrow">Fotomax</p><h1>{locale === "zh-HK" ? "確認資料已失效" : "Confirmation unavailable"}</h1><p>{locale === "zh-HK" ? "為保障私隱，訂單確認資料已過期。你可以在帳戶內查看訂單。" : "For privacy, this confirmation has expired. You can view orders from your account."}</p><Link className="button primary" href={localeHref(locale, "/account/orders")}>{locale === "zh-HK" ? "查看訂單" : "View orders"}</Link></main>

  return <main id="main-content" className="page-shell confirmation-page"><p className="eyebrow">Fotomax</p><h1>{locale === "zh-HK" ? "訂單已確認" : "Order confirmed"}</h1><p>{locale === "zh-HK" ? "多謝你的訂單，我們已收到資料。" : "Thank you. Your order has been received."}</p><dl className="confirmation-summary"><div><dt>{locale === "zh-HK" ? "訂單編號" : "Order"}</dt><dd>#{confirmation.displayId}</dd></div><div><dt>{locale === "zh-HK" ? "總額" : "Total"}</dt><dd>{formatCatalogMoney(confirmation.total, locale)}</dd></div><div><dt>{locale === "zh-HK" ? "取貨方式" : "Fulfillment"}</dt><dd>{confirmation.fulfillmentKind === "pickup" ? locale === "zh-HK" ? "門市取貨" : "Store pickup" : locale === "zh-HK" ? "香港送貨" : "Hong Kong delivery"}</dd></div></dl><div className="confirmation-actions"><Link className="button primary" href={localeHref(locale, "/account/orders")}>{locale === "zh-HK" ? "查看訂單" : "View orders"}</Link><Link className="button secondary" href={localeHref(locale, "/")}>{locale === "zh-HK" ? "繼續購物" : "Continue shopping"}</Link></div></main>
}
