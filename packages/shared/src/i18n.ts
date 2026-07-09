export const locales = ["zh-HK", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "zh-HK"

export type LocalizedText = Record<Locale, string>

export const localeLabels: Record<Locale, string> = {
  "zh-HK": "繁體中文",
  en: "English",
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

export function localize(value: LocalizedText, locale: Locale): string {
  return value[locale] || value[defaultLocale]
}

export const copy = {
  cart: { "zh-HK": "購物車", en: "Cart" },
  shopNow: { "zh-HK": "立即選購", en: "Shop now" },
  browseCategory: { "zh-HK": "瀏覽分類", en: "Browse category" },
  storePickup: { "zh-HK": "門市取貨", en: "Store pickup" },
  nextPhase: { "zh-HK": "下一階段推出", en: "Coming in the next phase" },
  addToCart: { "zh-HK": "加入購物車", en: "Add to cart" },
  addedToCart: { "zh-HK": "已加入購物車", en: "Added to cart" },
} as const satisfies Record<string, LocalizedText>

export type CopyKey = keyof typeof copy

export function t(locale: Locale, key: CopyKey): string {
  return copy[key][locale]
}
