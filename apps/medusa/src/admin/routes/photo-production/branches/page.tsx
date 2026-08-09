import { defineRouteConfig } from "@medusajs/admin-sdk"
import { BuildingStorefront } from "@medusajs/icons"

import { BranchCapabilityOperations } from "../../../components/branch-capability-operations"

export default function BranchCapabilitiesPage() {
  return <BranchCapabilityOperations />
}

export const config = defineRouteConfig({ label: "Branch capabilities", icon: BuildingStorefront })
