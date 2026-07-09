import Image from "next/image"
import Link from "next/link"

export default function NotFound() {
  return (
    <main className="page-shell not-found">
      <p className="eyebrow">Fotomax</p>
      <h1>Page not found</h1>
      <p>The requested Fotomax page is not available.</p>
      <Link className="button primary" href="/zh-HK">
        Back to homepage
      </Link>
    </main>
  )
}
