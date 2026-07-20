import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260720000100 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "photo_job" drop constraint if exists "photo_job_status_check";')
    this.addSql(`alter table "photo_job" add constraint "photo_job_status_check" check ("status" in ('draft', 'uploading', 'ready', 'cart_attached', 'ordered', 'fulfilled', 'failed', 'cancelled', 'expired'));`)
    this.addSql(`alter table "photo_job" add column if not exists "production_status" text null check ("production_status" in ('accepted', 'processing', 'ready', 'in_production', 'ready_for_pickup', 'shipped', 'fulfilled', 'failed', 'cancelled'));`)
    this.addSql('alter table "photo_job" add column if not exists "fulfilled_at" timestamptz null, add column if not exists "retention_hold_until" timestamptz null, add column if not exists "media_expires_at" timestamptz null;')
    this.addSql('create index if not exists "IDX_photo_job_production_status" on "photo_job" ("production_status") where "deleted_at" is null;')
    this.addSql('alter table "photo_asset" alter column "object_key" drop not null, add column if not exists "media_deleted_at" timestamptz null;')
  }

  async down(): Promise<void> {
    this.addSql(`update "photo_job" set "status" = 'ordered' where "status" = 'fulfilled';`)
    this.addSql('alter table "photo_job" drop constraint if exists "photo_job_status_check";')
    this.addSql(`alter table "photo_job" add constraint "photo_job_status_check" check ("status" in ('draft', 'uploading', 'ready', 'cart_attached', 'ordered', 'failed', 'cancelled', 'expired'));`)
    this.addSql('drop index if exists "IDX_photo_job_production_status";')
    this.addSql('alter table "photo_job" drop column if exists "production_status", drop column if exists "fulfilled_at", drop column if exists "retention_hold_until", drop column if exists "media_expires_at";')
    this.addSql('alter table "photo_asset" drop column if exists "media_deleted_at";')
  }
}
