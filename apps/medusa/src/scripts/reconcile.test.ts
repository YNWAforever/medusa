import { describe, expect, it } from "vitest"

import { reconcileByKey } from "./reconcile"

describe("reconcileByKey", () => {
  it("updates existing keys, creates missing keys, and plans no creates on a second run", () => {
    const desired = [
      { sku: "FOTOMAX-4R-1", title: "Classic 4R" },
      { sku: "FOTOMAX-INSTAX-1", title: "Instax Mini" },
    ]
    const existing = [{ id: "variant_4r", sku: "FOTOMAX-4R-1", title: "Old title" }]

    const firstPlan = reconcileByKey({
      desired,
      existing,
      desiredKey: (value) => value.sku,
      existingKey: (value) => value.sku,
      toCreate: (value) => ({ ...value }),
      toUpdate: (next, current) => ({ id: current.id, ...next }),
    })

    expect(firstPlan).toEqual({
      create: [{ sku: "FOTOMAX-INSTAX-1", title: "Instax Mini" }],
      update: [{ id: "variant_4r", sku: "FOTOMAX-4R-1", title: "Classic 4R" }],
    })

    const secondPlan = reconcileByKey({
      desired,
      existing: [
        ...existing,
        { id: "variant_instax", sku: "FOTOMAX-INSTAX-1", title: "Instax Mini" },
      ],
      desiredKey: (value) => value.sku,
      existingKey: (value) => value.sku,
      toCreate: (value) => ({ ...value }),
      toUpdate: (next, current) => ({ id: current.id, ...next }),
    })

    expect(secondPlan.create).toEqual([])
    expect(secondPlan.update).toHaveLength(2)
  })

  it("rejects duplicate existing keys deterministically", () => {
    expect(() =>
      reconcileByKey({
        desired: [{ sku: "FOTOMAX-4R-1" }],
        existing: [
          { id: "variant_first", sku: "FOTOMAX-4R-1" },
          { id: "variant_second", sku: "FOTOMAX-4R-1" },
        ],
        desiredKey: (value) => value.sku,
        existingKey: (value) => value.sku,
        toCreate: (value) => value,
        toUpdate: (next, current) => ({ id: current.id, ...next }),
      }),
    ).toThrow('Duplicate existing key "FOTOMAX-4R-1"')
  })
})
