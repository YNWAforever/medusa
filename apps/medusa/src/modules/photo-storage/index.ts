import { Module } from "@medusajs/framework/utils"
import PhotoStorageModuleService from "./service"

export const PHOTO_STORAGE_MODULE = "photoStorage"

export default Module(PHOTO_STORAGE_MODULE, {
  service: PhotoStorageModuleService,
})

export type { PhotoObjectStorage } from "./types"
