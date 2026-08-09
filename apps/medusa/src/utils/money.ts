export function toMinorUnits(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("invalid_money_amount")
  }

  const scaled = value * 100
  const rounded = Math.round(scaled)
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4
  if (!Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > tolerance) {
    throw new Error("invalid_money_amount")
  }
  return rounded
}
