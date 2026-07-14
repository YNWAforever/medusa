import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { describe, expect, it, vi } from "vitest"

import exportPublishableKey, {
  exportPublishableKeyToGitHubEnv,
  resolvePublishableKey,
} from "./export-publishable-key"
import { STAGING_PUBLISHABLE_KEY_TITLE } from "./seed-constants"

describe("CI publishable key export", () => {
  it("writes the single seeded publishable key to GitHub Actions without logging it", async () => {
    const append = vi.fn(async () => undefined)

    await exportPublishableKeyToGitHubEnv({
      records: [
        {
          title: "Fotomax Storefront Staging",
          type: "publishable",
          token: "pk_ci_seeded",
        },
      ],
      outputPath: "/tmp/github-env",
      append,
    })

    expect(append).toHaveBeenCalledWith(
      "/tmp/github-env",
      "MEDUSA_PUBLISHABLE_KEY=pk_ci_seeded\n",
    )
  })

  it("rejects missing and duplicate seeded keys", () => {
    expect(() => resolvePublishableKey([])).toThrow(
      "Expected exactly one Fotomax Storefront Staging publishable key, found 0",
    )
    expect(() =>
      resolvePublishableKey([
        { title: "Fotomax Storefront Staging", type: "publishable", token: "pk_one" },
        { title: "Fotomax Storefront Staging", type: "publishable", token: "pk_two" },
      ]),
    ).toThrow(
      "Expected exactly one Fotomax Storefront Staging publishable key, found 2",
    )
  })

  it("rejects values that could inject another GitHub environment entry", () => {
    expect(() =>
      resolvePublishableKey([
        {
          title: "Fotomax Storefront Staging",
          type: "publishable",
          token: "pk_valid\nANOTHER_SECRET=leak",
        },
      ]),
    ).toThrow("Seeded publishable key contains an invalid line break")
  })

  it("queries the seeded key through the Medusa entrypoint without logging it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fotomax-key-export-"))
    const outputPath = join(directory, "github-env")
    const token = "pk_runtime_seeded"
    const graph = vi.fn(async () => ({
      data: [
        {
          title: STAGING_PUBLISHABLE_KEY_TITLE,
          type: "publishable",
          token,
        },
      ],
    }))
    const info = vi.fn()
    const resolve = vi.fn((key: string) => {
      if (key === ContainerRegistrationKeys.QUERY) return { graph }
      if (key === ContainerRegistrationKeys.LOGGER) return { info }
      throw new Error(`Unexpected container key: ${key}`)
    })
    vi.stubEnv("GITHUB_ENV", outputPath)

    try {
      await exportPublishableKey({
        args: [],
        container: { resolve } as unknown as ExecArgs["container"],
      })

      expect(graph).toHaveBeenCalledWith({
        entity: "api_key",
        fields: ["title", "type", "token"],
        filters: { title: STAGING_PUBLISHABLE_KEY_TITLE },
      })
      expect(await readFile(outputPath, "utf8")).toBe(
        `MEDUSA_PUBLISHABLE_KEY=${token}\n`,
      )
      expect(info).toHaveBeenCalledWith(
        "Exported the seeded storefront publishable key to GitHub Actions",
      )
      expect(info.mock.calls.flat().join(" ")).not.toContain(token)
    } finally {
      vi.unstubAllEnvs()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
