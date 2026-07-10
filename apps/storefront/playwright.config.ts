import { defineConfig, devices } from "@playwright/test"

const host = "127.0.0.1"
const port = process.env.FOTOMAX_E2E_PORT ?? "3100"
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `node ../../node_modules/next/dist/bin/next dev --hostname ${host} --port ${port}`,
    url: `${baseURL}/zh-HK`,
    reuseExistingServer: false,
    timeout: 120000,
  },
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
