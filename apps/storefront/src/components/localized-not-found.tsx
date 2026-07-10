import Link from "next/link"
import React from "react"
import type { Locale } from "@fotomax/shared"
import { localeHref } from "../lib/locales"

export function LocalizedNotFound({ locale }: { locale: Locale }) {
  return (
    <main id="main-content" className="page-shell not-found">
      <p className="eyebrow">Fotomax</p>
      <h1>{locale === "zh-HK" ? "找不到頁面" : "Page not found"}</h1>
      <p>
        {locale === "zh-HK"
          ? "你所尋找的 Fotomax 頁面不存在或已被移除。"
          : "The requested Fotomax page is not available."}
      </p>
      <Link className="button primary" href={localeHref(locale, "/")}>
        {locale === "zh-HK" ? "返回首頁" : "Back to homepage"}
      </Link>
    </main>
  )
}
