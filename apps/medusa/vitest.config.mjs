import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: ["integration-tests/**", "node_modules/**"],
  },
})
