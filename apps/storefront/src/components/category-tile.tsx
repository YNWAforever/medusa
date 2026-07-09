import { ArrowRight } from "lucide-react"
import Link from "next/link"
import React, { type CSSProperties } from "react"
import { localize, t, type Category, type Locale } from "@fotomax/shared"
import { localeHref } from "../lib/locales"

export function CategoryTile({ category, locale }: { category: Category; locale: Locale }) {
  return (
    <Link
      className="category-tile"
      href={localeHref(locale, `/categories/${category.handle}`)}
      style={{ "--accent": category.accent } as CSSProperties}
    >
      <span>{localize(category.name, locale)}</span>
      <p>{localize(category.summary, locale)}</p>
      <strong>
        {t(locale, "browseCategory")}
        <ArrowRight size={16} aria-hidden="true" />
      </strong>
    </Link>
  )
}
