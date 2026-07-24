import type { PhotoStorageConfig } from "./types"

type Environment = Record<string, string | undefined>

function required(env: Environment, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`photo_storage_config_invalid:${name}`)
  return value
}

export function loadPhotoStorageConfig(env: Environment): PhotoStorageConfig {
  const endpoint = required(env, "PHOTO_STORAGE_ENDPOINT")
  try {
    const parsed = new URL(endpoint)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error()
  } catch {
    throw new Error("photo_storage_config_invalid:PHOTO_STORAGE_ENDPOINT")
  }

  const pathStyle = required(env, "PHOTO_STORAGE_FORCE_PATH_STYLE")
  if (pathStyle !== "true" && pathStyle !== "false") {
    throw new Error("photo_storage_config_invalid:PHOTO_STORAGE_FORCE_PATH_STYLE")
  }

  const encryption = env.PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION?.trim() ?? "true"
  if (!['true', 'false'].includes(encryption) || (encryption === 'false' && env.NODE_ENV === 'production')) {
    throw new Error("photo_storage_config_invalid:PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION")
  }

  return {
    endpoint,
    region: required(env, "PHOTO_STORAGE_REGION"),
    bucket: required(env, "PHOTO_STORAGE_BUCKET"),
    accessKeyId: required(env, "PHOTO_STORAGE_ACCESS_KEY"),
    secretAccessKey: required(env, "PHOTO_STORAGE_SECRET_KEY"),
    forcePathStyle: pathStyle === "true",
    serverSideEncryption: encryption === "true",
  }
}
