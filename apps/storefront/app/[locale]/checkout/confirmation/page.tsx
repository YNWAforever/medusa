import React from "react"
import type { Locale } from "../../../../src/lib/medusa/contracts"
import { OrderConfirmation } from "../../../../src/components/order-confirmation"
import { assertLocale } from "../../../../src/lib/locales"

export default async function CheckoutConfirmationPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: Locale = assertLocale((await params).locale)
  return <OrderConfirmation locale={locale} />
}
