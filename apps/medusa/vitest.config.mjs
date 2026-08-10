import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const appRoot = fileURLToPath(new URL(".", import.meta.url))
const resolveAppDependency = (dependency) =>
  resolve(appRoot, "node_modules", dependency)

export default defineConfig({
  resolve: {
    alias: {
      react: resolveAppDependency("react"),
      "react/jsx-runtime": resolveAppDependency("react/jsx-runtime"),
      "react/jsx-dev-runtime": resolveAppDependency("react/jsx-dev-runtime"),
      "react-dom": resolveAppDependency("react-dom"),
      "react-dom/server": resolveAppDependency("react-dom/server"),
    },
  },
  ssr: {
    noExternal: [
      "@medusajs/ui",
      "@medusajs/icons",
      "@radix-ui/react-slot",
      "radix-ui",
    ],
  },
  test: {
    exclude: [".medusa/**", "integration-tests/**", "node_modules/**"],
  },
})
