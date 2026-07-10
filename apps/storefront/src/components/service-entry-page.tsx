import Link from "next/link"
import { UploadCloud } from "lucide-react"
import React from "react"
import { localize, t, type Locale, type ServiceEntry } from "@fotomax/shared"
import { localeHref } from "../lib/locales"

export function ServiceEntryPage({ entry, locale }: { entry: ServiceEntry; locale: Locale }) {
  return (
    <main id="main-content" className="page-shell service-entry-page">
      <div className="service-icon">
        <UploadCloud size={34} aria-hidden="true" />
      </div>
      <p className="eyebrow">{t(locale, "comingSoon")}</p>
      <h1>{localize(entry.title, locale)}</h1>
      <p>{localize(entry.summary, locale)}</p>
      <Link className="button primary" href={localeHref(locale, `/categories/${entry.categoryHandle}`)}>
        {localize(entry.actionLabel, locale)}
      </Link>
    </main>
  )
}
