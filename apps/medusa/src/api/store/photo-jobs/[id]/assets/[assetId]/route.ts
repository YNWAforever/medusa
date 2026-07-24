import { MedusaError } from "@medusajs/framework/utils";
import { PHOTO_PRODUCTION_MODULE } from "../../../../../../modules/photo-production";
import { verifyGuestSecret } from "../../../../../../modules/photo-production/ownership";
import { assertPhotoAssetTransition } from "../../../../../../modules/photo-production/state-machine";
import { PHOTO_STORAGE_MODULE } from "../../../../../../modules/photo-storage";
function notFound(): never {
  throw new MedusaError(MedusaError.Types.NOT_FOUND, "photo_job_not_found");
}
function conflict(): never {
  throw new MedusaError(MedusaError.Types.CONFLICT, "photo_asset_not_active");
}
function header(req: any, name: string): string | null {
  return typeof req.headers?.get === "function"
    ? req.headers.get(name)
    : (req.headers?.[name] ?? null);
}
function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
export async function DELETE(req: any, res: any): Promise<void> {
  const service: any = req.scope.resolve(PHOTO_PRODUCTION_MODULE);
  const storage: any = req.scope.resolve(PHOTO_STORAGE_MODULE);
  const jobId = req.params?.id?.trim();
  const assetId = req.params?.assetId?.trim();
  if (!jobId || !assetId) notFound();
  let job: any;
  let asset: any;
  try {
    job = await service.retrievePhotoJob(jobId);
    asset = await service.retrievePhotoAsset(assetId);
  } catch {
    notFound();
  }
  const customerId = req.auth_context?.actor_id?.trim();
  const guest = header(req, "x-fotomax-guest-token")?.trim();
  const owned = customerId
    ? job.customer_id === customerId
    : guest &&
      job.guest_owner_hash &&
      verifyGuestSecret(guest, job.guest_owner_hash);
  if (!owned || asset.job_id !== jobId || job.status === "expired") notFound();
  if (asset.status !== "deleted") {
    asset = await service.withPhotoJobTransaction(
      async (context: any) => {
        const latest = await service.retrievePhotoAsset(
          asset.id,
          undefined,
          context,
        );
        if (latest.status === "deleted") return latest;
        try {
          assertPhotoAssetTransition(latest.status, "deleted");
        } catch {
          conflict();
        }
        const active = await service.listPhotoUploadSessions(
          { asset_id: asset.id, status: "active" },
          {},
          context,
        );
        for (const session of active) {
          const updated = first(
            await service.updatePhotoUploadSessions(
              {
                selector: { id: session.id, status: "active" },
                data: { status: "aborted", aborted_at: new Date() },
              },
              context,
            ),
          );
          if (!updated) conflict();
        }
        return (
          first(
            await service.updatePhotoAssets(
              {
                selector: { id: asset.id, status: latest.status },
                data: { status: "deleted" },
              },
              context,
            ),
          ) ?? conflict()
        );
      },
      { isolationLevel: "serializable" },
    );
  }
  const sessions = await service.listPhotoUploadSessions({
    asset_id: asset.id,
  });
  for (const session of sessions)
    if (session.provider_upload_id)
      await storage.abortMultipartUpload({
        key: asset.object_key,
        uploadId: session.provider_upload_id,
      });
  await storage.deletePrivateObjects([asset.object_key]);
  res.json({ asset: { id: asset.id, status: "deleted" } });
}
