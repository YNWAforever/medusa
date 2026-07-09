import { type Locale } from "@fotomax/shared"
import { assertLocale } from "@/lib/locales"

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params
  const locale: Locale = assertLocale(localeParam)

  return (
    <main className="page-shell">
      <section className="hero-band">
        <p className="eyebrow">Fotomax</p>
        <h1>{locale === "zh-HK" ? "現代影像生活商店" : "Modern Photo Commerce"}</h1>
        <p>{locale === "zh-HK" ? "相片沖印、相簿、菲林及個人化禮品。" : "Photo print, photobooks, film, and personalized gifts."}</p>
      </section>
    </main>
  )
}
