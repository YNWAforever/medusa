import { assertPhotoAssetTransition } from "../modules/photo-production/state-machine";

type RetryInput = {
  assetId: string;
  jobId: string;
  actorId: string;
  requestId?: string;
};

export async function retryDeadLetteredPhotoAsset(
  input: RetryInput,
  dependencies: {
    service: any;
    eventBus: {
      emit(input: { name: string; data: unknown }): Promise<void> | void;
    };
  },
) {
  const asset = await dependencies.service.retrievePhotoAsset(input.assetId);
  if (
    !asset ||
    asset.job_id !== input.jobId ||
    asset.status !== "failed" ||
    asset.failure_class !== "dead_letter"
  )
    throw new Error("photo_asset_retry_unavailable");

  await dependencies.service.createPhotoAssetAccessAudits({
    asset_id: asset.id,
    actor_id: input.actorId,
    actor_type: "admin",
    action: "retry",
    reason: "dead_letter_recovery",
    request_id: input.requestId ?? null,
  });
  assertPhotoAssetTransition("failed", "processing");
  const result = await dependencies.service.updatePhotoAssets({
    selector: { id: asset.id, status: "failed", failure_class: "dead_letter" },
    data: {
      status: "processing",
      dead_lettered_at: null,
      failure_class: null,
      failure_code: null,
      errors: [],
      failed_at: null,
      last_activity_at: new Date(),
    },
  });
  const updated = Array.isArray(result) ? result[0] : result;
  if (!updated) throw new Error("photo_asset_retry_unavailable");
  await dependencies.eventBus.emit({
    name: "photo_asset.uploaded",
    data: { asset_id: asset.id },
  });
  return updated;
}
