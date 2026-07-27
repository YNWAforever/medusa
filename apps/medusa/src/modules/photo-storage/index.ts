import { Module } from "@medusajs/framework/utils"
import PhotoStorageModuleService from "./service"

export const PHOTO_STORAGE_MODULE = "photoStorage"

export default Module(PHOTO_STORAGE_MODULE, {
  service: PhotoStorageModuleService,
})

export { S3PhotoStorageAdapter } from "./s3-adapter"
export { VercelBlobPhotoStorageAdapter } from "./vercel-blob-adapter"
export type {
  PhotoObjectRef,
  PhotoObjectStorage,
  PhotoStorageProvider,
} from "./types"
