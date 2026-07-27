import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260726000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(`alter table "photo_asset" add column if not exists "storage_provider" text null check ("storage_provider" in ('s3', 'vercel-blob')), add column if not exists "provider_etag" text null;`)
    this.addSql(`alter table "photo_upload_session" add column if not exists "storage_provider" text null check ("storage_provider" in ('s3', 'vercel-blob')), add column if not exists "upload_strategy" text null check ("upload_strategy" in ('multipart', 'single-put')), add column if not exists "completion_metadata" jsonb null;`)
    this.addSql(`update "photo_asset" set "storage_provider" = 's3' where "storage_provider" is null;`)
    this.addSql(`update "photo_upload_session" set "storage_provider" = 's3', "upload_strategy" = 'multipart' where "storage_provider" is null or "upload_strategy" is null;`)
    this.addSql(`alter table "photo_asset" alter column "storage_provider" set default 's3', alter column "storage_provider" set not null;`)
    this.addSql(`alter table "photo_upload_session" alter column "storage_provider" set default 's3', alter column "storage_provider" set not null, alter column "upload_strategy" set default 'multipart', alter column "upload_strategy" set not null;`)
    this.addSql('create index if not exists "IDX_photo_asset_storage_provider" on "photo_asset" ("storage_provider") where "deleted_at" is null;')
    this.addSql('create index if not exists "IDX_photo_upload_session_storage_provider" on "photo_upload_session" ("storage_provider") where "deleted_at" is null;')
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_photo_upload_session_storage_provider";')
    this.addSql('drop index if exists "IDX_photo_asset_storage_provider";')
    this.addSql('alter table "photo_upload_session" drop column if exists "completion_metadata", drop column if exists "upload_strategy", drop column if exists "storage_provider";')
    this.addSql('alter table "photo_asset" drop column if exists "provider_etag", drop column if exists "storage_provider";')
  }
}