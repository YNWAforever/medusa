import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260719000200 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "photo_asset" drop constraint if exists "photo_asset_status_check";')
    this.addSql('alter table "photo_asset" add constraint "photo_asset_status_check" check ("status" in (\'pending\', \'uploading\', \'uploaded\', \'processing\', \'ready\', \'blocked\', \'failed\', \'deleted\'));')
    this.addSql('alter table "photo_asset" add column if not exists "preview_key" text null, add column if not exists "sha256" text null, add column if not exists "width" int null, add column if not exists "height" int null, add column if not exists "orientation" int null, add column if not exists "quality_band" text null, add column if not exists "estimated_ppi" int null, add column if not exists "warnings" jsonb null, add column if not exists "errors" jsonb null, add column if not exists "processing_attempts" int not null default 0, add column if not exists "failure_class" text null, add column if not exists "dead_lettered_at" timestamptz null, add column if not exists "last_activity_at" timestamptz null, add column if not exists "deletion_requested_at" timestamptz null;')
    this.addSql('create unique index if not exists "IDX_photo_asset_preview_key_unique" on "photo_asset" ("preview_key") where "preview_key" is not null and deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_asset_job_sha256_ready" on "photo_asset" ("job_id", "sha256") where status = \'ready\' and sha256 is not null and deleted_at is null;')
  }
  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_photo_asset_job_sha256_ready";')
    this.addSql('drop index if exists "IDX_photo_asset_preview_key_unique";')
    this.addSql('update "photo_asset" set "status" = case when "status" = \'ready\' then \'uploaded\' when "status" in (\'processing\', \'blocked\') then \'failed\' else "status" end;')
    this.addSql('alter table "photo_asset" drop constraint if exists "photo_asset_status_check";')
    this.addSql('alter table "photo_asset" add constraint "photo_asset_status_check" check ("status" in (\'pending\', \'uploading\', \'uploaded\', \'failed\', \'deleted\'));')
    this.addSql('alter table "photo_asset" drop column if exists "preview_key", drop column if exists "sha256", drop column if exists "width", drop column if exists "height", drop column if exists "orientation", drop column if exists "quality_band", drop column if exists "estimated_ppi", drop column if exists "warnings", drop column if exists "errors", drop column if exists "processing_attempts", drop column if exists "failure_class", drop column if exists "dead_lettered_at", drop column if exists "last_activity_at", drop column if exists "deletion_requested_at";')
  }
}
