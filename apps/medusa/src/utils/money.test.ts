import { describe, expect, it } from "vitest"

import { toMinorUnits } from "./money"

describe("toMinorUnits", () => {
  it("converts Medusa major-unit prices to integer cents", () => {
    expect(toMinorUnits(2.8)).toBe(280)
    expect(toMinorUnits(0)).toBe(0)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 0.001])(
    "rejects an unsafe amount: %s",
    (value) => expect(() => toMinorUnits(value)).toThrow("invalid_money_amount"),
  )
})
