import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { PHOTO_PRODUCTION_MODULE } from "../modules/photo-production";
import { PHOTO_STORAGE_MODULE } from "../modules/photo-storage";

export const PHOTO_UPLOAD_CLEANUP_BATCH = 100;
type Dependencies = {
  service: any;
  storage: any;
  logger: { info(message: string): void; warn(message: string): void };
  now?: Date;
  batchSize?: number;
};
function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
function event(
  logger: Dependencies["logger"],
  level: "info" | "warn",
  code: string,
  fields: Record<string, string>,
) {
  logger[level](
    [
      `code=${code}`,
      ...Object.entries(fields).map(([key, value]) => `${key}=${value}`),
    ].join(" "),
  );
}

export async function runPhotoUploadCleanup({
  service,
  storage,
  logger,
  now = new Date(),
  batchSize = PHOTO_UPLOAD_CLEANUP_BATCH,
}: Dependencies) {
  const summary = { expiredSessions: 0, deletedAssets: 0, failures: 0 };
  const sessions = await service.listPhotoUploadSessions(
    { status: "active", expires_at: { $lt: now } },
    { take: batchSize, order: { expires_at: "ASC" } },
  );
  for (const session of sessions.slice(0, batchSize)) {
    let asset: any;
    try {
      asset = await service.retrievePhotoAsset(session.asset_id);
      if (session.provider_upload_id)
        await storage.abortMultipartUpload({
          key: asset.object_key,
          uploadId: session.provider_upload_id,
        });
      const updated = first(
        await service.updatePhotoUploadSessions({
          selector: { id: session.id, status: "active" },
          data: { status: "expired", aborted_at: now },
        }),
      );
      if (!updated) throw new Error("conditional_update_empty");
      if (asset.status === "uploading")
        await service.updatePhotoAssets({
          selector: { id: asset.id, status: "uploading" },
          data: {
            status: "failed",
            failure_code: "upload_expired",
            failed_at: now,
          },
        });
      summary.expiredSessions += 1;
      event(logger, "info", "photo_cleanup_session_expired", {
        session_id: session.id,
        asset_id: asset.id,
        object_key: asset.object_key,
      });
    } catch {
      await service
        .updatePhotoUploadSessions({
          selector: { id: session.id, status: "active" },
          data: { expires_at: new Date(now.getTime() + 15 * 60 * 1000) },
        })
        .catch(() => undefined);
      summary.failures += 1;
      event(logger, "warn", "photo_cleanup_provider_retry", {
        session_id: session.id,
        asset_id: asset?.id ?? "unknown",
        object_key: asset?.object_key ?? "unknown",
      });
    }
  }

  const deletedAssets = await service.listPhotoAssets(
    { status: "deleted", provider_cleanup_completed_at: null },
    { take: batchSize, order: { updated_at: "ASC" }, withDeleted: true },
  );
  const remaining = Math.max(0, batchSize - deletedAssets.length);
  const jobs = remaining
    ? await service.listPhotoJobs(
        { status: ["cancelled", "expired"] },
        { take: remaining, order: { updated_at: "ASC" } },
      )
    : [];
  const terminalAssets: any[] = [];
  for (const job of jobs) {
    const assets = await service.listPhotoAssets(
      { job_id: job.id, provider_cleanup_completed_at: null },
      { take: remaining - terminalAssets.length, order: { updated_at: "ASC" } },
    );
    terminalAssets.push(...assets);
    await service.updatePhotoJobs({
      selector: { id: job.id },
      data: { last_activity_at: now },
    });
    if (terminalAssets.length >= remaining) break;
  }

  const candidates = [...deletedAssets, ...terminalAssets];
  for (const asset of candidates.slice(0, batchSize)) {
    try {
      const assetSessions = await service.listPhotoUploadSessions({
        asset_id: asset.id,
      });
      for (const session of assetSessions)
        if (session.provider_upload_id)
          await storage.abortMultipartUpload({
            key: asset.object_key,
            uploadId: session.provider_upload_id,
          });
      await storage.deletePrivateObjects([asset.object_key]);
      const updated = first(
        await service.updatePhotoAssets({
          selector: { id: asset.id },
          data: {
            status: "deleted",
            deleted_at: asset.deleted_at ?? now,
            provider_cleanup_completed_at: now,
          },
        }),
      );
      if (!updated) throw new Error("conditional_update_empty");
      summary.deletedAssets += 1;
      event(logger, "info", "photo_cleanup_asset_deleted", {
        asset_id: asset.id,
        job_id: asset.job_id,
        object_key: asset.object_key,
      });
    } catch {
      await service
        .updatePhotoAssets({
          selector: { id: asset.id },
          data: { failure_code: "provider_cleanup_retry" },
        })
        .catch(() => undefined);
      summary.failures += 1;
      event(logger, "warn", "photo_cleanup_asset_retry", {
        asset_id: asset.id,
        job_id: asset.job_id,
        object_key: asset.object_key,
      });
    }
  }
  return summary;
}

export default async function photoUploadCleanup(container: MedusaContainer) {
  await runPhotoUploadCleanup({
    service: container.resolve(PHOTO_PRODUCTION_MODULE),
    storage: container.resolve(PHOTO_STORAGE_MODULE),
    logger: container.resolve(ContainerRegistrationKeys.LOGGER),
  });
}

export const config = {
  name: "photo-upload-cleanup",
  schedule: "*/15 * * * *",
};
