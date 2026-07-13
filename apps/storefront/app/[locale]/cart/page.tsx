import Link from "next/link"
import React from "react"
import type { Locale } from "@fotomax/shared"
import { assertLocale, localeHref } from "../../../src/lib/locales"

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return (
    <main id="main-content" className="page-shell cart-page">
      <p className="eyebrow">{locale === "zh-HK" ? "購物車" : "Cart"}</p>
      <h1>{locale === "zh-HK" ? "準備結帳" : "Ready to checkout"}</h1>
      <p>
        {locale === "zh-HK"
          ? "購物車內容會在你繼續瀏覽時保留。"
          : "Your cart stays saved while you continue browsing."}
      </p>
      <p>
        {locale === "zh-HK"
          ? "確認聯絡資料，選擇送貨或門市取貨，然後完成訂單。"
          : "Confirm your details, choose delivery or pickup, and complete your order."}
      </p>
      <Link className="button primary" href={localeHref(locale, "/checkout")}>
        {locale === "zh-HK" ? "前往結帳" : "Go to checkout"}
      </Link>
    </main>
  )
}
