import { type Locale } from "@fotomax/shared"
import { HomePage } from "@/components/home-page"
import { assertLocale } from "@/lib/locales"

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return <HomePage locale={locale} />
}
