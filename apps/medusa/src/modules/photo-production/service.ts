import {
  InjectTransactionManager,
  MedusaContext,
  MedusaService,
} from "@medusajs/framework/utils"
import PhotoAsset from "./models/photo-asset"
import PhotoAssetAccessAudit from "./models/photo-asset-access-audit"
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

const PhotoProductionModuleServiceBase = MedusaService({
  PhotoJob,
  PhotoAsset,
  PhotoUploadSession,
  PhotoAssetAccessAudit,
})

type GeneratedCreatePhotoJobs = InstanceType<typeof PhotoProductionModuleServiceBase>["createPhotoJobs"]

class PhotoProductionModuleService extends PhotoProductionModuleServiceBase {
  @InjectTransactionManager()
  async withPhotoJobTransaction<T>(
    callback: (sharedContext: Record<string, unknown>) => Promise<T>,
    @MedusaContext() sharedContext: Record<string, unknown> = {},
  ): Promise<T> {
    return callback(sharedContext)
  }

  async createPhotoJob(
    data: CreatePhotoJobInput,
    ...rest: Parameters<GeneratedCreatePhotoJobs> extends [unknown, ...infer TrailingArgs]
      ? TrailingArgs
      : never
  ) {
    assertExactlyOnePhotoJobOwner(data)
    return this.createPhotoJobs(data, ...rest)
  }

  createPhotoJobs = (async (
    data: CreatePhotoJobInput | CreatePhotoJobInput[],
    ...rest: unknown[]
  ) => {
    for (const photoJob of Array.isArray(data) ? data : [data]) {
      assertExactlyOnePhotoJobOwner(photoJob)
    }

    const createPhotoJobs = super.createPhotoJobs as (
      ...args: [CreatePhotoJobInput | CreatePhotoJobInput[], ...unknown[]]
    ) => unknown
    return createPhotoJobs.call(this, data, ...rest)
  }) as GeneratedCreatePhotoJobs
}

export default PhotoProductionModuleService
