import React from "react"
import type { Locale } from "@fotomax/shared"

type Quote = { subtotal: number; currencyCode: string; quoteExpiresAt: string; requiresReview?: boolean }
export function QuoteSummary({ locale, quote, loading, disabled, onReview }: { locale: Locale; quote: Quote | null; loading: boolean; disabled: boolean; onReview(): void }) {
  const copy = locale === "zh-HK" ? { review: "檢視報價", loading: "正在計算報價", total: "沖印小計", expires: "報價有效至", changed: "價格已更新，請重新確認。" } : { review: "Review quote", loading: "Calculating quote", total: "Print subtotal", expires: "Quote valid until", changed: "Pricing changed. Please review again." }
  return <section className="quote-summary" aria-live="polite">
    {quote ? <div><span>{copy.total}</span><strong>{new Intl.NumberFormat(locale, { style: "currency", currency: quote.currencyCode.toUpperCase() }).format(quote.subtotal / 100)}</strong><small>{copy.expires} {new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(quote.quoteExpiresAt))}</small>{quote.requiresReview ? <p role="alert">{copy.changed}</p> : null}</div> : <span />}
    <button type="button" className="button primary" disabled={disabled || loading} onClick={onReview}>{loading ? copy.loading : copy.review}</button>
  </section>
}