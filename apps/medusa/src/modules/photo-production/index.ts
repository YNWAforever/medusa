import { Module } from "@medusajs/framework/utils"
import PhotoProductionModuleService from "./service"

export const PHOTO_PRODUCTION_MODULE = "photoProduction"

export default Module(PHOTO_PRODUCTION_MODULE, {
  service: PhotoProductionModuleService,
})
