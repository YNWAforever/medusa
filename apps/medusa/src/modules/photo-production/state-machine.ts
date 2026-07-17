export type PhotoJobStatus =
  | "draft"
  | "uploading"
  | "ready"
  | "failed"
  | "cancelled"
  | "expired"

export type PhotoAssetStatus =
  | "pending"
  | "uploading"
  | "uploaded"
  | "failed"
  | "deleted"

export type PhotoUploadSessionStatus =
  | "active"
  | "completed"
  | "aborted"
  | "expired"

const photoJobTransitions: Record<PhotoJobStatus, readonly PhotoJobStatus[]> = {
  draft: ["uploading", "cancelled", "expired"],
  uploading: ["ready", "failed", "cancelled", "expired"],
  ready: ["uploading", "cancelled", "expired"],
  failed: ["uploading", "cancelled", "expired"],
  cancelled: [],
  expired: [],
}

const photoAssetTransitions: Record<
  PhotoAssetStatus,
  readonly PhotoAssetStatus[]
> = {
  pending: ["uploading", "failed", "deleted"],
  uploading: ["uploaded", "failed", "deleted"],
  uploaded: ["deleted"],
  failed: ["uploading", "deleted"],
  deleted: [],
}

const uploadSessionTransitions: Record<
  PhotoUploadSessionStatus,
  readonly PhotoUploadSessionStatus[]
> = {
  active: ["completed", "aborted", "expired"],
  completed: [],
  aborted: [],
  expired: [],
}

function assertTransition<T extends string>(
  transitions: Record<T, readonly T[]>,
  from: T,
  to: T,
): void {
  if (!transitions[from].includes(to)) {
    throw new Error("photo_state_transition_invalid")
  }
}

export function assertPhotoJobTransition(
  from: PhotoJobStatus,
  to: PhotoJobStatus,
): void {
  assertTransition(photoJobTransitions, from, to)
}

export function assertPhotoAssetTransition(
  from: PhotoAssetStatus,
  to: PhotoAssetStatus,
): void {
  assertTransition(photoAssetTransitions, from, to)
}

export function assertUploadSessionTransition(
  from: PhotoUploadSessionStatus,
  to: PhotoUploadSessionStatus,
): void {
  assertTransition(uploadSessionTransitions, from, to)
}
