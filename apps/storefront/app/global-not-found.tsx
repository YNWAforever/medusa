import type { Metadata } from "next"
import Link from "next/link"
import React from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Page not found | Fotomax",
  description: "Choose a language to return to Fotomax.",
}

export default function GlobalNotFound() {
  return (
    <html lang="zh-HK">
      <body>
        <main id="main-content" className="page-shell not-found">
          <p className="eyebrow">Fotomax</p>
          <h1>Page not found / 找不到頁面</h1>
          <p>Choose a language to return to Fotomax. 請選擇語言返回 Fotomax。</p>
          <div className="not-found-actions" aria-label="Language / 語言">
            <Link className="button primary" href="/en">
              English
            </Link>
            <Link className="button primary" href="/zh-HK">
              繁體中文
            </Link>
          </div>
        </main>
      </body>
    </html>
  )
}
