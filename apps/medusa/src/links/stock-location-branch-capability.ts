import { defineLink } from "@medusajs/framework/utils"
import StockLocationModule from "@medusajs/medusa/stock-location"
import BranchCapabilityModule from "../modules/branch-capability"

export default defineLink(
  { linkable: StockLocationModule.linkable.stockLocation, isList: false },
  { linkable: BranchCapabilityModule.linkable.branchCapability, isList: false },
)
