import Link from "next/link"
import React from "react"
import { t, type Locale } from "@fotomax/shared"
import { assertLocale, localeHref } from "../../../src/lib/locales"

export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return (
    <main id="main-content" className="page-shell cart-page">
      <p className="eyebrow">{t(locale, "comingSoon")}</p>
      <h1>{locale === "zh-HK" ? "購物車已準備好" : "Your cart is ready"}</h1>
      <p>
        {locale === "zh-HK"
          ? "購物車內容會在你繼續瀏覽時保留。"
          : "Your cart stays saved while you continue browsing."}
      </p>
      <p>
        {locale === "zh-HK"
          ? "結帳、付款及訂單確認即將推出。"
          : "Checkout, payment, and order confirmation are coming soon."}
      </p>
      <Link className="button primary" href={localeHref(locale, "/")}>
        {locale === "zh-HK" ? "繼續選購" : "Continue shopping"}
      </Link>
    </main>
  )
}
