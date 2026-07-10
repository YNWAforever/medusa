import { defineConfig, loadEnv } from "@medusajs/framework/utils"
import { resolveMedusaRuntimeEnv } from "./src/runtime-env"

loadEnv(process.env.NODE_ENV || "development", process.cwd())
const runtimeEnv = resolveMedusaRuntimeEnv(process.env)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: runtimeEnv.storeCors,
      adminCors: runtimeEnv.adminCors,
      authCors: runtimeEnv.authCors,
      jwtSecret: runtimeEnv.jwtSecret,
      cookieSecret: runtimeEnv.cookieSecret,
    },
  },
})
