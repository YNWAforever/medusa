import { PHOTO_PRODUCTION_MODULE } from "../../../../../../../modules/photo-production";
import { retryDeadLetteredPhotoAsset } from "../../../../../../../workflows/retry-photo-asset";

export async function POST(req: any, res: any): Promise<void> {
  const jobId = req.params?.id?.trim();
  const assetId = req.params?.assetId?.trim();
  if (!jobId || !assetId || !req.auth_context?.actor_id) {
    res.status(404).send();
    return;
  }
  try {
    const asset = await retryDeadLetteredPhotoAsset(
      {
        assetId,
        jobId,
        actorId: req.auth_context.actor_id,
        requestId: req.headers?.["x-request-id"],
      },
      {
        service: req.scope.resolve(PHOTO_PRODUCTION_MODULE),
        eventBus: req.scope.resolve("event_bus"),
      },
    );
    res.json({ asset: { id: asset.id, status: asset.status } });
  } catch {
    res.status(404).send();
  }
}
