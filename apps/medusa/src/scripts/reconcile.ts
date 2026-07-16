export interface ReconcilePlan<TCreate, TUpdate> {
  create: TCreate[]
  update: TUpdate[]
}

export function reconcileByKey<TDesired, TExisting, TCreate, TUpdate>(args: {
  desired: readonly TDesired[]
  existing: readonly TExisting[]
  desiredKey: (value: TDesired) => string
  existingKey: (value: TExisting) => string
  toCreate: (value: TDesired) => TCreate
  toUpdate: (desired: TDesired, existing: TExisting) => TUpdate
}): ReconcilePlan<TCreate, TUpdate> {
  const existingByKey = new Map<string, TExisting>()

  for (const value of args.existing) {
    const key = args.existingKey(value)
    if (existingByKey.has(key)) {
      throw new Error(`Duplicate existing key "${key}"`)
    }
    existingByKey.set(key, value)
  }

  const create: TCreate[] = []
  const update: TUpdate[] = []

  for (const desired of args.desired) {
    const existing = existingByKey.get(args.desiredKey(desired))
    if (existing) {
      update.push(args.toUpdate(desired, existing))
    } else {
      create.push(args.toCreate(desired))
    }
  }

  return { create, update }
}
