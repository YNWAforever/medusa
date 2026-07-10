import { isLocale, type Locale } from "@fotomax/shared"

export function assertLocale(value: string): Locale {
  if (!isLocale(value)) {
    throw new Error(`Unsupported locale: ${value}`)
  }

  return value
}

export function localeHref(locale: Locale, pathname: string): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `/${locale}${normalized}`
}
