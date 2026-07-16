import React from "react"
import type { Locale } from "../../../src/lib/medusa/contracts"
import { CheckoutFlow } from "../../../src/components/checkout-flow"
import { assertLocale } from "../../../src/lib/locales"

export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: Locale = assertLocale((await params).locale)
  return <CheckoutFlow locale={locale} />
}
