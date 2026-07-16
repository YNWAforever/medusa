import { defineConfig, loadEnv } from "@medusajs/framework/utils"
import { buildInfrastructureModules } from "./src/infrastructure-modules"
import { loadRuntimeEnv } from "./src/runtime-env"

loadEnv(process.env.NODE_ENV || "development", process.cwd())
const runtimeEnv = loadRuntimeEnv(process.env)

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: runtimeEnv.databaseUrl,
    workerMode: runtimeEnv.workerMode,
    http: {
      storeCors: runtimeEnv.storeCors,
      adminCors: runtimeEnv.adminCors,
      authCors: runtimeEnv.authCors,
      jwtSecret: runtimeEnv.jwtSecret,
      cookieSecret: runtimeEnv.cookieSecret,
    },
  },
  admin: {
    disable: runtimeEnv.disableAdmin,
  },
  modules: [
    ...buildInfrastructureModules(runtimeEnv),
    { resolve: "./src/modules/branch-capability" },
  ],
})
