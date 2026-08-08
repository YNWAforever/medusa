import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Button } from "@medusajs/ui"

import { storefrontHomeHref } from "../storefront-url"

export default function StorefrontLink() {
  if (!__STOREFRONT_URL__) {
    return null
  }

  return (
    <Button asChild size="small" variant="transparent">
      <a
        href={storefrontHomeHref(__STOREFRONT_URL__)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span>Open storefront</span>
        <svg
          aria-hidden="true"
          focusable="false"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 5h5v5M19 5l-9 9M19 13v6H5V5h6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </a>
    </Button>
  )
}

export const config = defineWidgetConfig({
  id: "fotomax:storefront-link",
  zone: "topbar",
})
