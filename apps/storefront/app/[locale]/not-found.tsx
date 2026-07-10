"use client"

import { useParams } from "next/navigation"
import React from "react"
import { defaultLocale, isLocale, type Locale } from "@fotomax/shared"
import { LocalizedNotFound } from "../../src/components/localized-not-found"

export default function LocaleNotFound() {
  const params = useParams<{ locale?: string | string[] }>()
  const localeParam = Array.isArray(params.locale) ? params.locale[0] : params.locale
  const locale: Locale = localeParam && isLocale(localeParam) ? localeParam : defaultLocale

  return <LocalizedNotFound locale={locale} />
}
