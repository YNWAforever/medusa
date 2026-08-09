import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Photo } from "@medusajs/icons"

import { PhotoProductionOperations } from "../../components/photo-production-operations"

export default function PhotoProductionPage() {
  return <PhotoProductionOperations />
}

export const config = defineRouteConfig({ label: "Photo production", icon: Photo })
