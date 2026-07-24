import { describe, expect, it } from "vitest"
import { loadPhotoStorageConfig } from "./config"

const validEnv = {
  PHOTO_STORAGE_ENDPOINT: "http://localhost:9002",
  PHOTO_STORAGE_REGION: "us-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
  PHOTO_STORAGE_ACCESS_KEY: "fotomax",
  PHOTO_STORAGE_SECRET_KEY: "local-secret",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "true",
}

describe("loadPhotoStorageConfig", () => {
  it("loads a complete S3-compatible configuration", () => {
    expect(loadPhotoStorageConfig(validEnv)).toEqual({
      endpoint: "http://localhost:9002",
      region: "us-east-1",
      bucket: "fotomax-photo-private",
      accessKeyId: "fotomax",
      secretAccessKey: "local-secret",
      forcePathStyle: true,
      serverSideEncryption: true,
    })
  })

  it.each(Object.keys(validEnv))("rejects a missing %s", (name) => {
    expect(() => loadPhotoStorageConfig({ ...validEnv, [name]: "" })).toThrow(
      `photo_storage_config_invalid:${name}`,
    )
  })

  it("allows unencrypted object writes only outside production", () => {
    expect(loadPhotoStorageConfig({
      ...validEnv,
      NODE_ENV: "test",
      PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
    }).serverSideEncryption).toBe(false)
    expect(() => loadPhotoStorageConfig({
      ...validEnv,
      NODE_ENV: "production",
      PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
    })).toThrow("photo_storage_config_invalid:PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION")
  })
  it("rejects invalid endpoints and path-style values", () => {
    expect(() => loadPhotoStorageConfig({ ...validEnv, PHOTO_STORAGE_ENDPOINT: "secret" })).toThrow("photo_storage_config_invalid:PHOTO_STORAGE_ENDPOINT")
    expect(() => loadPhotoStorageConfig({ ...validEnv, PHOTO_STORAGE_FORCE_PATH_STYLE: "yes" })).toThrow("photo_storage_config_invalid:PHOTO_STORAGE_FORCE_PATH_STYLE")
  })
})
