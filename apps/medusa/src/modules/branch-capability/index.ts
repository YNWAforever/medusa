import { Module } from "@medusajs/framework/utils"
import BranchCapabilityModuleService from "./service"

export const BRANCH_CAPABILITY_MODULE = "branchCapability"
export default Module(BRANCH_CAPABILITY_MODULE, { service: BranchCapabilityModuleService })
