import { appendFile } from "node:fs/promises"

import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

import { STAGING_PUBLISHABLE_KEY_TITLE } from "./seed-constants"

interface PublishableKeyRecord {
  title?: unknown
  type?: unknown
  token?: unknown
}

interface ExportPublishableKeyOptions {
  records: unknown[]
  outputPath: string
  append?: (path: string, data: string) => Promise<unknown>
}

function asPublishableKeyRecord(value: unknown): PublishableKeyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as PublishableKeyRecord
    : {}
}

export function resolvePublishableKey(records: unknown[]): string {
  const matches = records
    .map(asPublishableKeyRecord)
    .filter(
      (record) =>
        record.title === STAGING_PUBLISHABLE_KEY_TITLE &&
        record.type === "publishable",
    )

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${STAGING_PUBLISHABLE_KEY_TITLE} publishable key, found ${matches.length}`,
    )
  }

  const token = matches[0].token
  if (typeof token !== "string" || token.trim().length === 0) {
    throw new Error("Seeded publishable key is missing its token")
  }
  if (/\r|\n/.test(token)) {
    throw new Error("Seeded publishable key contains an invalid line break")
  }

  return token
}

export async function exportPublishableKeyToGitHubEnv({
  records,
  outputPath,
  append = appendFile,
}: ExportPublishableKeyOptions): Promise<void> {
  if (!outputPath.trim()) {
    throw new Error("GITHUB_ENV is required to export the seeded publishable key")
  }

  const token = resolvePublishableKey(records)
  await append(outputPath, `MEDUSA_PUBLISHABLE_KEY=${token}\n`)
}

export default async function exportPublishableKey({ container }: ExecArgs) {
  const outputPath = process.env.GITHUB_ENV ?? ""
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const response = await query.graph({
    entity: "api_key",
    fields: ["title", "type", "token"],
    filters: { title: STAGING_PUBLISHABLE_KEY_TITLE },
  })

  await exportPublishableKeyToGitHubEnv({
    records: response.data,
    outputPath,
  })
  logger.info("Exported the seeded storefront publishable key to GitHub Actions")
}
