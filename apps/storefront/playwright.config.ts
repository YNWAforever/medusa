import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const host = "127.0.0.1";
const port = process.env.FOTOMAX_E2E_PORT ?? "3100";
const baseURL = `http://${host}:${port}`;
const webServerTimeout = 240_000;

const mockedPhotoUpload = process.env.FOTOMAX_E2E_MOCKED === "1";
const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../..");
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
const backendOnlyEnvironmentKeys = new Set([
  "ADMIN_CORS",
  "AUTH_CORS",
  "BLOB_READ_WRITE_TOKEN",
  "COOKIE_SECRET",
  "DATABASE_URL",
  "JWT_SECRET",
  "MEDUSA_WORKER_MODE",
  "PGDATABASE",
  "PGHOST",
  "PGPASSFILE",
  "PGPASSWORD",
  "PGPORT",
  "PGSERVICE",
  "PGSERVICEFILE",
  "PGUSER",
  "REDIS_URL",
  "STORE_CORS",
  "VERCEL_OIDC_TOKEN",
]);
const backendOnlyEnvironmentPrefixes = [
  "AWS_ACCESS_KEY_",
  "AWS_CONTAINER_CREDENTIALS_",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AWS_SHARED_CREDENTIALS_",
  "AWS_WEB_IDENTITY_",
  "DB_",
  "MINIO_",
  "PHOTO_STORAGE_",
  "POSTGRES_",
  "REDIS_",
  "S3_",
];
const childProcessEnv = Object.fromEntries(
  Object.entries(inheritedEnv).filter(([key]) => {
    const normalizedKey = key.toUpperCase();
    return !backendOnlyEnvironmentKeys.has(normalizedKey)
      && !backendOnlyEnvironmentPrefixes.some((prefix) =>
        normalizedKey.startsWith(prefix));
  }),
);
const medusaEnv = {
  ...childProcessEnv,
  NODE_ENV: "development",
  DATABASE_URL: "postgres://fotomax:fotomax_local_only@localhost:5432/fotomax",
  REDIS_URL: "redis://localhost:6379",
  MEDUSA_WORKER_MODE: "shared",
  STORE_CORS: `${baseURL},http://localhost:9000`,
  ADMIN_CORS: "http://localhost:9000",
  AUTH_CORS: `${baseURL},http://localhost:9000`,
  JWT_SECRET: "fotomax-local-jwt-secret",
  COOKIE_SECRET: "fotomax-local-cookie-secret",
  PHOTO_STORAGE_PROVIDER: "s3",
  PHOTO_STORAGE_ENDPOINT: "http://localhost:9002",
  PHOTO_STORAGE_REGION: "us-east-1",
  PHOTO_STORAGE_BUCKET: "fotomax-photo-private",
  PHOTO_STORAGE_ACCESS_KEY: "fotomax_minio",
  PHOTO_STORAGE_SECRET_KEY: "fotomax_minio_local_only",
  PHOTO_STORAGE_FORCE_PATH_STYLE: "true",
  PHOTO_STORAGE_SERVER_SIDE_ENCRYPTION: "false",
};
async function resolvePublishableKey(): Promise<string> {
  const configured = process.env.MEDUSA_PUBLISHABLE_KEY;
  if (configured) return configured;
  if (mockedPhotoUpload) return "pk_e2e_mocked";

  type Client = {
    connect(): Promise<void>;
    query(
      sql: string,
      values: unknown[],
    ): Promise<{ rows: Array<{ token: string }> }>;
    end(): Promise<void>;
  };
  const require = createRequire(import.meta.url);
  const pg = require(path.join(repoRoot, "node_modules/pg")) as {
    Client: new (config: { connectionString: string }) => Client;
  };
  const client = new pg.Client({ connectionString: medusaEnv.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT token FROM api_key WHERE title = $1 AND type = 'publishable' AND revoked_at IS NULL",
      ["Fotomax Storefront Staging"],
    );
    if (result.rows.length !== 1) {
      throw new Error(
        `Expected one seeded Fotomax publishable key, found ${result.rows.length}`,
      );
    }
    return result.rows[0].token;
  } finally {
    await client.end();
  }
}
const publishableKey = await resolvePublishableKey();
const storefrontEnv = {
  ...childProcessEnv,
  NODE_ENV: "development",
  FOTOMAX_E2E: "1",
  STOREFRONT_ORIGIN: baseURL,
  MEDUSA_BACKEND_URL: process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000",
  MEDUSA_PUBLISHABLE_KEY: publishableKey,
  STOREFRONT_SESSION_SECRET:
    process.env.STOREFRONT_SESSION_SECRET ?? "fotomax-local-session-secret",
};

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
    ...(mockedPhotoUpload
      ? []
      : [
          {
            name: "Medusa",
            command: "npm run dev --workspace @fotomax/medusa",
            cwd: repoRoot,
            env: medusaEnv,
            url: "http://127.0.0.1:9000/health",
            reuseExistingServer: false,
            timeout: webServerTimeout,
          },
        ]),
    {
      name: "Storefront",
      command: `node ../../node_modules/next/dist/bin/next dev --webpack --hostname ${host} --port ${port}`,
      cwd: configDir,
      env: storefrontEnv,
      url: mockedPhotoUpload
        ? `${baseURL}/photo-upload-e2e`
        : `${baseURL}/zh-HK`,
      reuseExistingServer: false,
      timeout: webServerTimeout,
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
});
