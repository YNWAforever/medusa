"use client"

import React from "react"
import "./globals.css"

/**
 * The only boundary that can catch a throw from `app/[locale]/layout.tsx`.
 *
 * That layout awaits `getCatalogView()`, so a Medusa outage fails before any
 * page renders. There is deliberately no `app/layout.tsx`, and a sibling
 * `[locale]/error.tsx` cannot catch its own layout — so this file must render a
 * complete document itself, the same way `global-not-found.tsx` does.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-HK">
      <body>
        <main id="main-content" className="page-shell not-found">
          <p className="eyebrow">Fotomax</p>
          <h1>Something went wrong / 發生錯誤</h1>
          <p>
            We could not load the store just now. Please try again. 暫時無法載入商店，請再試一次。
          </p>
          <div className="not-found-actions" aria-label="Recovery / 復原">
            <button className="button primary" type="button" onClick={() => reset()}>
              Try again / 再試一次
            </button>
            <a className="button secondary" href="/zh-HK">
              繁體中文
            </a>
            <a className="button secondary" href="/en">
              English
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
