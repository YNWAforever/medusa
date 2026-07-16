import Link from "next/link"
import { UploadCloud } from "lucide-react"
import React from "react"
import { t } from "@fotomax/shared"
import type { ServiceEntry } from "../content/services"
import type { Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"

export function ServiceEntryPage({ entry, locale }: { entry: ServiceEntry; locale: Locale }) { return <main id="main-content" className="page-shell service-entry-page"><div className="service-icon"><UploadCloud size={34} aria-hidden="true" /></div><p className="eyebrow">{t(locale, "comingSoon")}</p><h1>{entry.title[locale]}</h1><p>{entry.summary[locale]}</p><Link className="button primary" href={localeHref(locale, `/categories/${entry.categoryHandle}`)}>{entry.actionLabel[locale]}</Link></main> }