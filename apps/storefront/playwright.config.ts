import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, devices } from "@playwright/test"

const host = "127.0.0.1"
const port = process.env.FOTOMAX_E2E_PORT ?? "3100"
const baseURL = `http://${host}:${port}`
const configDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(configDir, "../..")
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)
const medusaEnv = {
  ...inheritedEnv,
  NODE_ENV: "development",
  DATABASE_URL: process.env.DATABASE_URL ?? "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  MEDUSA_WORKER_MODE: "shared",
  STORE_CORS: process.env.STORE_CORS ?? `${baseURL},http://localhost:9000`,
  ADMIN_CORS: process.env.ADMIN_CORS ?? "http://localhost:9000",
  AUTH_CORS: process.env.AUTH_CORS ?? `${baseURL},http://localhost:9000`,
  JWT_SECRET: process.env.JWT_SECRET ?? "fotomax-local-jwt-secret",
  COOKIE_SECRET: process.env.COOKIE_SECRET ?? "fotomax-local-cookie-secret",
}
const storefrontEnv = {
  ...inheritedEnv,
  NODE_ENV: "development",
  MEDUSA_BACKEND_URL: process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000",
  MEDUSA_PUBLISHABLE_KEY: process.env.MEDUSA_PUBLISHABLE_KEY ?? "pk_ceb30b0af83b88e98f7d65d0411e0340e0018954513b5dfff37420de68d96fc2",
  STOREFRONT_SESSION_SECRET: process.env.STOREFRONT_SESSION_SECRET ?? "fotomax-local-session-secret",
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 120_000,
  workers: 1,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      name: "Medusa",
      command: "npm run dev --workspace @fotomax/medusa",
      cwd: repoRoot,
      env: medusaEnv,
      url: "http://127.0.0.1:9000/health",
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      name: "Storefront",
      command: `node ../../node_modules/next/dist/bin/next dev --webpack --hostname ${host} --port ${port}`,
      cwd: configDir,
      env: storefrontEnv,
      url: `${baseURL}/zh-HK`,
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] },
    },
  ],
})
