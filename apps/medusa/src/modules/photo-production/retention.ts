const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

export type RetentionJob = {
  status: string
  retention_class: string
  last_activity_at: Date | string
  fulfilled_at?: Date | string | null
  retention_hold_until?: Date | string | null
}

function date(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value)
}

export function calculateMediaExpiry(job: RetentionJob): Date | null {
  if (job.status === "ordered" && !job.fulfilled_at) return null

  const accelerated = job.retention_class === "accelerated_test"
  const fulfilled = job.status === "fulfilled" && job.fulfilled_at
  const base = fulfilled ? date(job.fulfilled_at!) : date(job.last_activity_at)
  const duration = fulfilled
    ? accelerated ? 30 * MINUTE_MS : 720 * HOUR_MS
    : accelerated ? 15 * MINUTE_MS : 168 * HOUR_MS
  const expiry = new Date(base.getTime() + duration)
  if (!job.retention_hold_until) return expiry
  const hold = date(job.retention_hold_until)
  return hold > expiry ? hold : expiry
}

export function isRetentionEligible(job: RetentionJob, now = new Date()): boolean {
  const expiry = calculateMediaExpiry(job)
  return Boolean(expiry && expiry.getTime() <= now.getTime())
}

export function validateRetentionTestMode(source: Record<string, string | undefined>): void {
  if (source.PHOTO_RETENTION_TEST_MODE !== "true") return
  if (source.NODE_ENV !== "production") return
  const safe = source.MEDUSA_CLOUD_ENVIRONMENT_TYPE === "long-lived"
    && /staging/i.test(source.MEDUSA_CLOUD_ENVIRONMENT_NAME ?? "")
  if (!safe) throw new Error("photo_retention_test_mode_unsafe")
}

export function acceleratedRetentionEnabled(source: Record<string, string | undefined>): boolean {
  validateRetentionTestMode(source)
  return source.PHOTO_RETENTION_TEST_MODE === "true"
}
