import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { OpenRectArrowOut } from "@medusajs/icons"
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
        <OpenRectArrowOut aria-hidden="true" />
      </a>
    </Button>
  )
}

export const config = defineWidgetConfig({
  id: "fotomax:storefront-link",
  zone: "topbar",
})
