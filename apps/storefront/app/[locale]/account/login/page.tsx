import React from "react"
import type { Locale } from "../../../../src/lib/medusa/contracts"
import { assertLocale } from "../../../../src/lib/locales"
import { AccountForm } from "../../../../src/components/account-form"

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale: Locale = assertLocale((await params).locale)
  return <main id="main-content" className="page-shell account-page"><div className="account-heading"><p className="eyebrow">Fotomax</p><h1>{locale === "zh-HK" ? "登入帳戶" : "Sign in"}</h1></div><AccountForm locale={locale} mode="login" /></main>
}
