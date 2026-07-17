import { MedusaService } from "@medusajs/framework/utils"
import PhotoAsset from "./models/photo-asset"
import PhotoJob from "./models/photo-job"
import PhotoUploadSession from "./models/photo-upload-session"

export type CreatePhotoJobInput = {
  guest_owner_hash?: string | null
  customer_id?: string | null
  [key: string]: unknown
}

export function assertExactlyOnePhotoJobOwner({
  guest_owner_hash,
  customer_id,
}: Pick<CreatePhotoJobInput, "guest_owner_hash" | "customer_id">): void {
  const hasGuestOwner = Boolean(guest_owner_hash?.trim())
  const hasCustomerOwner = Boolean(customer_id?.trim())

  if (hasGuestOwner === hasCustomerOwner) {
    throw new Error("photo_job_owner_invalid")
  }
}

class PhotoProductionModuleService extends MedusaService({
  PhotoJob,
  PhotoAsset,
  PhotoUploadSession,
}) {
  async createPhotoJob(data: CreatePhotoJobInput) {
    assertExactlyOnePhotoJobOwner(data)
    return this.createPhotoJobs(data)
  }
}

export default PhotoProductionModuleService
