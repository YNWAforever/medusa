import { spawnSync } from "node:child_process"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { categories, products, serviceEntries } from "@fotomax/shared"

const medusaRoot = fileURLToPath(new URL("../..", import.meta.url))
const tsconfigPath = join(medusaRoot, "tsconfig.json")

const sharedCatalogProbe = `
const { createRequire } = require("node:module")
const { join } = require("node:path")
const appRequire = createRequire(join(process.cwd(), "package.json"))

appRequire("ts-node").register({ project: ${JSON.stringify(tsconfigPath)} })

const { categories, products, serviceEntries } = appRequire("@fotomax/shared")
process.stdout.write(JSON.stringify({
  categories: categories.length,
  products: products.length,
  serviceEntries: serviceEntries.length,
  firstProduct: products[0].handle,
}))
`

describe("Fotomax seed loader", () => {
  it("keeps the shared catalog available to normal ESM consumers", () => {
    expect({
      categories: categories.length,
      products: products.length,
      serviceEntries: serviceEntries.length,
      firstProduct: products[0].handle,
    }).toEqual({
      categories: 6,
      products: 5,
      serviceEntries: 3,
      firstProduct: "classic-4r-photo-print",
    })
  })

  it("loads the shared catalog through the Medusa ts-node boundary", () => {
    const result = spawnSync(process.execPath, ["-e", sharedCatalogProbe], {
      cwd: medusaRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        TS_NODE_PROJECT: tsconfigPath,
      },
    })

    expect({
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stdout: JSON.stringify({
        categories: 6,
        products: 5,
        serviceEntries: 3,
        firstProduct: "classic-4r-photo-print",
      }),
      stderr: "",
    })
  })
})
