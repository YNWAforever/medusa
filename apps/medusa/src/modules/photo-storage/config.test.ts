import { describe, expect, it } from "vitest"
import { loadPhotoStorageConfig, loadPhotoStorageRuntimeConfig } from "./config"

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

describe("loadPhotoStorageRuntimeConfig", () => {
  it("requires a default provider", () => {
    expect(() => loadPhotoStorageRuntimeConfig({})).toThrow(
      "photo_storage_config_invalid:PHOTO_STORAGE_PROVIDER",
    )
  })
  it("loads an S3 default with only S3 configuration", () => {
    expect(loadPhotoStorageRuntimeConfig({
      PHOTO_STORAGE_PROVIDER: "s3",
      ...validEnv,
    })).toEqual({
      defaultProvider: "s3",
      s3: {
        endpoint: "http://localhost:9002",
        region: "us-east-1",
        bucket: "fotomax-photo-private",
        accessKeyId: "fotomax",
        secretAccessKey: "local-secret",
        forcePathStyle: true,
        serverSideEncryption: true,
      },
    })
  })

  it("loads a Vercel Blob default with only its token", () => {
    const blobEnv = {
      NODE_ENV: "production",
      PHOTO_STORAGE_PROVIDER: "vercel-blob",
      BLOB_READ_WRITE_TOKEN: "vercel-blob-token",
    }

    expect(loadPhotoStorageRuntimeConfig(blobEnv)).toEqual({
      defaultProvider: "vercel-blob",
      vercelBlob: { token: "vercel-blob-token" },
    })
  })

  it("loads both adapters when retaining S3 for historical reads", () => {
    expect(loadPhotoStorageRuntimeConfig({
      PHOTO_STORAGE_PROVIDER: "vercel-blob",
      BLOB_READ_WRITE_TOKEN: "vercel-blob-token",
      ...validEnv,
    })).toEqual({
      defaultProvider: "vercel-blob",
      s3: {
        endpoint: "http://localhost:9002",
        region: "us-east-1",
        bucket: "fotomax-photo-private",
        accessKeyId: "fotomax",
        secretAccessKey: "local-secret",
        forcePathStyle: true,
        serverSideEncryption: true,
      },
      vercelBlob: { token: "vercel-blob-token" },
    })
  })

  it("rejects a missing Blob token", () => {
    expect(() => loadPhotoStorageRuntimeConfig({
      PHOTO_STORAGE_PROVIDER: "vercel-blob",
      BLOB_READ_WRITE_TOKEN: "",
    })).toThrow("photo_storage_config_invalid:BLOB_READ_WRITE_TOKEN")
  })

  it("rejects unknown providers without printing secret values", () => {
    const token = "must-not-appear-in-errors"

    expect(() => loadPhotoStorageRuntimeConfig({
      PHOTO_STORAGE_PROVIDER: "unknown",
      BLOB_READ_WRITE_TOKEN: token,
    })).toThrow("photo_storage_config_invalid:PHOTO_STORAGE_PROVIDER")

    try {
      loadPhotoStorageRuntimeConfig({
        PHOTO_STORAGE_PROVIDER: "unknown",
        BLOB_READ_WRITE_TOKEN: token,
      })
    } catch (error) {
      expect((error as Error).message).not.toContain(token)
    }
  })
})
