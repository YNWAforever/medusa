import { createHash } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { validateImageInput } from "../modules/photo-production/image-policy";
import { processImage } from "../modules/photo-production/image-processor";
import {
  assertPhotoAssetTransition,
  type PhotoAssetStatus,
} from "../modules/photo-production/state-machine";
import { photoObjectRef, type PhotoObjectStorage } from "../modules/photo-storage/types";

type Asset = Record<string, any> & {
  id: string;
  job_id: string;
  object_key: string;
  storage_provider?: string | null;
  display_name: string;
  reported_mime_type: string | null;
  status: PhotoAssetStatus;
  expected_bytes: number;
};

export type ProcessingDependencies = {
  storage: PhotoObjectStorage;
  service: any;
  locking: {
    acquire(
      key: string,
      ttl: number,
    ): Promise<{ release(): Promise<void> | void }>;
  };
  eventBus?: {
    emit(input: { name: string; data: unknown }): Promise<void> | void;
  };
};

const permanentCodes = new Set([
  "photo_file_unsupported",
  "photo_file_type_mismatch",
  "photo_file_too_large",
  "photo_file_invalid_size",
  "photo_image_decode_failed",
  "photo_image_pixel_limit_exceeded",
  "photo_image_resolution_too_low",
]);

export const isPermanentProcessingError = (error: unknown) =>
  error instanceof Error && permanentCodes.has(error.message);

const previewKey = (asset: Asset) =>
  `${asset.object_key.replace("/originals/", "/previews/")}.jpg`;

const first = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

function hashingStream(source: Readable) {
  const hash = createHash("sha256");
  let resolve!: (value: string) => void;
  const digest = new Promise<string>((done) => {
    resolve = done;
  });
  const stream = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      callback(null, chunk);
    },
    flush(callback) {
      resolve(hash.digest("hex"));
      callback();
    },
  });
  source.pipe(stream);
  return { stream, digest };
}

async function buffer(stream: Readable, maximum: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const value = Buffer.from(chunk);
    total += value.length;
    if (total > maximum) throw new Error("photo_file_too_large");
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function transitionCurrent(
  service: any,
  asset: Asset,
  target: PhotoAssetStatus,
  data: Record<string, unknown>,
): Promise<Asset> {
  assertPhotoAssetTransition(asset.status, target);
  const updated = first(
    await service.updatePhotoAssets({
      selector: { id: asset.id, status: asset.status },
      data: { ...data, status: target },
    }),
  );
  if (!updated) throw new Error("photo_asset_state_changed");
  return updated as Asset;
}

async function patchProcessing(
  service: any,
  asset: Asset,
  data: Record<string, unknown>,
): Promise<Asset> {
  const updated = first(
    await service.updatePhotoAssets({
      selector: { id: asset.id, status: "processing" },
      data,
    }),
  );
  if (!updated) throw new Error("photo_asset_state_changed");
  return updated as Asset;
}

async function latestAsset(
  service: any,
  assetId: string,
): Promise<Asset | null> {
  try {
    return (await service.retrievePhotoAsset(assetId)) as Asset;
  } catch (error) {
    if (
      error instanceof Error &&
      /not[ _-]?found/i.test(error.message)
    )
      return null;
    throw error;
  }
}

export async function processPhotoAsset(
  assetId: string,
  dependencies: ProcessingDependencies,
): Promise<Asset | null> {
  const assetLock = await dependencies.locking.acquire(
    `photo-asset:${assetId}`,
    120,
  );
  try {
    let asset = await latestAsset(dependencies.service, assetId);
    if (!asset || ["ready", "blocked", "deleted"].includes(asset.status))
      return asset;
    if (asset.status === "failed" && asset.failure_class === "dead_letter")
      return asset;
    if (asset.status === "uploaded" || asset.status === "failed") {
      asset = await transitionCurrent(
        dependencies.service,
        asset,
        "processing",
        {
          last_activity_at: new Date(),
        },
      );
    } else if (asset.status !== "processing") {
      return asset;
    }

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let writtenPreview: string | null = null;
      try {
        const current = await latestAsset(dependencies.service, asset.id);
        if (!current || current.status !== "processing") return current;
        asset = await patchProcessing(dependencies.service, current, {
          processing_attempts: (current.processing_attempts ?? 0) + 1,
          last_activity_at: new Date(),
        });

        const originalRef = photoObjectRef(asset, asset.object_key);
        const head = await dependencies.storage.inspect(originalRef);
        const signature = await dependencies.storage.readPrefix(
          originalRef,
          64,
        );
        const detected = validateImageInput({
          filename: asset.display_name,
          reportedMime: asset.reported_mime_type ?? head.contentType,
          bytes: head.bytes,
          signature,
        });
        const hashed = hashingStream(
          await dependencies.storage.read(originalRef),
        );
        const image = await processImage({
          filename: asset.display_name,
          reportedMime: asset.reported_mime_type ?? head.contentType,
          detectedMime: detected.detectedMime,
          bytes: head.bytes,
          source: hashed.stream,
          readOriginal: () => buffer(hashed.stream, 50 * 1024 * 1024),
        });
        const sha256 = await hashed.digest;

        const jobLock = await dependencies.locking.acquire(
          `photo-job:${asset.job_id}:dedupe`,
          120,
        );
        try {
          const latest = await latestAsset(dependencies.service, asset.id);
          if (!latest || latest.status !== "processing") return latest;
          const duplicates = await dependencies.service.listPhotoAssets({
            job_id: asset.job_id,
            status: "ready",
            sha256,
          });
          if (duplicates.some((candidate: Asset) => candidate.id !== assetId)) {
            await dependencies.storage.delete([originalRef]);
            return await transitionCurrent(
              dependencies.service,
              latest,
              "blocked",
              {
                sha256,
                failure_code: "duplicate_asset",
                errors: [{ code: "duplicate_asset", recoveryAction: "remove" }],
                last_activity_at: new Date(),
              },
            );
          }

          writtenPreview = previewKey(asset);
          await dependencies.storage.writePreview({
            ref: photoObjectRef(asset, writtenPreview),
            bytes: image.preview,
            contentType: "image/jpeg",
          });
          const beforeReady = await latestAsset(dependencies.service, asset.id);
          if (!beforeReady || beforeReady.status !== "processing") {
            await dependencies.storage
              .delete([photoObjectRef(asset, writtenPreview)])
              .catch(() => undefined);
            return beforeReady;
          }
          return await transitionCurrent(
            dependencies.service,
            beforeReady,
            "ready",
            {
              preview_key: writtenPreview,
              sha256,
              detected_mime_type: detected.detectedMime,
              width: image.width,
              height: image.height,
              orientation: image.orientation,
              estimated_ppi: image.estimatedPpi,
              quality_band: image.qualityBand,
              warnings:
                image.qualityBand === "good"
                  ? []
                  : [
                      {
                        code: `quality_${image.qualityBand}`,
                        acknowledged: false,
                      },
                    ],
              errors: [],
              failure_code: null,
              failure_class: null,
              dead_lettered_at: null,
              failed_at: null,
              last_activity_at: new Date(),
            },
          );
        } finally {
          await jobLock.release();
        }
      } catch (error) {
        if (writtenPreview) {
          await dependencies.storage
            .delete([photoObjectRef(asset, writtenPreview)])
            .catch(() => undefined);
          writtenPreview = null;
        }
        const code =
          error instanceof Error ? error.message : "photo_processing_failed";
        if (
          code === "photo_asset_state_changed" ||
          code === "photo_state_transition_invalid"
        ) {
          return await latestAsset(dependencies.service, asset.id);
        }
        const latest = await latestAsset(dependencies.service, asset.id);
        if (!latest || latest.status !== "processing") return latest;
        if (isPermanentProcessingError(error)) {
          return await transitionCurrent(
            dependencies.service,
            latest,
            "blocked",
            {
              failure_code: code,
              errors: [{ code, recoveryAction: "replace" }],
              last_activity_at: new Date(),
            },
          );
        }
        if (attempt === 3) {
          const failed = await transitionCurrent(
            dependencies.service,
            latest,
            "failed",
            {
              failure_code: "photo_processing_dead_letter",
              failure_class: "dead_letter",
              dead_lettered_at: new Date(),
              errors: [
                {
                  code: "photo_processing_dead_letter",
                  recoveryAction: "retry",
                },
              ],
              failed_at: new Date(),
              last_activity_at: new Date(),
            },
          );
          await dependencies.eventBus?.emit({
            name: "photo_asset.dead_lettered",
            data: { asset_id: assetId },
          });
          return failed;
        }
      }
    }
    return null;
  } finally {
    await assetLock.release();
  }
}
