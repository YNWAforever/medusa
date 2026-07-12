import { ArrowRight } from "lucide-react"
import Link from "next/link"
import React, { type CSSProperties } from "react"
import { t } from "@fotomax/shared"
import type { CatalogCategory, Locale } from "../lib/medusa/contracts"
import { localeHref } from "../lib/locales"

const accents: Record<string, string> = { "photo-print": "#e84855", photobook: "#3f7cac", "personalized-gifts": "#f5a623", "instax-film": "#00a6a6", lifestyle: "#7b61ff", promotions: "#111827" }
export function CategoryTile({ category, locale }: { category: CatalogCategory; locale: Locale }) { return <Link className="category-tile" href={localeHref(locale, `/categories/${category.handle}`)} style={{ "--accent": accents[category.handle] ?? "#111827" } as CSSProperties}><span>{category.title}</span><p>{category.summary}</p><strong>{t(locale, "browseCategory")}<ArrowRight size={16} aria-hidden="true" /></strong></Link> }