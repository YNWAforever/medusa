import React from "react"
import type { Locale } from "../../../../src/lib/medusa/contracts"
import { assertLocale } from "../../../../src/lib/locales"
import { OrderHistory } from "../../../../src/components/order-history"

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: Locale = assertLocale((await params).locale)
  return <main id="main-content" className="page-shell account-page"><OrderHistory locale={locale} /></main>
}
