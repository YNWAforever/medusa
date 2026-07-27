import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import stockLocationBranchCapabilityLink from "../../../links/stock-location-branch-capability"
import { adminActor, branchService, sendAdminError } from "../photo-jobs/admin-runtime"

export async function GET(req: any, res: any): Promise<void> {
  try {
    adminActor(req)
    const records = await branchService(req).listBranchCapabilities({}, { take: 100, order: { handle: "ASC" } })
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const links = await query.graph({ entity: stockLocationBranchCapabilityLink.entryPoint, fields: ["stock_location_id", "branch_capability_id"], filters: {} })
    const stockLocationByBranch = new Map(links.data.map((link: any) => [link.branch_capability_id, link.stock_location_id]))
    res.json({ branch_capabilities: records.map((branch: any) => ({
      id: branch.id,
      stock_location_id: stockLocationByBranch.get(branch.id) ?? null,
      handle: branch.handle,
      name_en: branch.name_en,
      name_zh_hk: branch.name_zh_hk,
      district_en: branch.district_en,
      district_zh_hk: branch.district_zh_hk,
      pickup_enabled: branch.pickup_enabled,
      test_only: branch.test_only,
      lead_time_business_days: branch.lead_time_business_days,
      supported_print_skus: branch.supported_print_skus,
    })) })
  } catch (error) { sendAdminError(res, error) }
}