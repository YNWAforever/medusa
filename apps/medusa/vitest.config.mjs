import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    exclude: [".medusa/**", "integration-tests/**", "node_modules/**"],
  },
})
