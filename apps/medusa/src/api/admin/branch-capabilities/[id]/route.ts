import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { validateBranchCapabilityUpdate } from "../../photo-jobs/admin-operations"
import { adminActor, branchService, sendAdminError } from "../../photo-jobs/admin-runtime"

export async function POST(req: any, res: any): Promise<void> {
  try {
    adminActor(req)
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const data = await validateBranchCapabilityUpdate({
      supportedPrintSkus: req.body?.supportedPrintSkus,
      leadTimeBusinessDays: req.body?.leadTimeBusinessDays,
      pickupEnabled: req.body?.pickupEnabled,
    }, async (sku) => {
      const result = await query.graph({ entity: "product_variant", fields: ["sku", "product.status", "product.metadata"], filters: { sku } })
      const variant: any = result.data[0]
      return variant ? { sku, published: variant.product?.status === "published", commerceMode: String(variant.product?.metadata?.commerce_mode ?? "") } : null
    })
    const service = branchService(req)
    const branch = await service.retrieveBranchCapability(String(req.params?.id ?? ""))
    const updated = await service.updateBranchCapabilities({ selector: { id: branch.id }, data: { ...data, test_only: true } })
    res.json({ branch_capability: Array.isArray(updated) ? updated[0] : updated })
  } catch (error) {
    sendAdminError(res, error)
  }
}
