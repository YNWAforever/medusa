import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors:
        process.env.STORE_CORS || "http://localhost:3000,http://localhost:8000",
      adminCors: process.env.ADMIN_CORS || "http://localhost:9000",
      authCors:
        process.env.AUTH_CORS ||
        "http://localhost:9000,http://localhost:3000,http://localhost:8000",
      jwtSecret: process.env.JWT_SECRET || "fotomax-local-jwt-secret",
      cookieSecret:
        process.env.COOKIE_SECRET || "fotomax-local-cookie-secret",
    },
  },
})
