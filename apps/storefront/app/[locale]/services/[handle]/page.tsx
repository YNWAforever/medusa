import { notFound } from "next/navigation"
import React from "react"
import { getServiceEntry, type Locale } from "@fotomax/shared"
import { ServiceEntryPage } from "../../../../src/components/service-entry-page"
import { assertLocale } from "../../../../src/lib/locales"

export default async function ServiceRoute({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>
}) {
  const { locale: localeParam, handle } = await params
  const locale: Locale = assertLocale(localeParam)
  const entry = getServiceEntry(handle)

  if (!entry) {
    notFound()
  }

  return <ServiceEntryPage entry={entry} locale={locale} />
}
