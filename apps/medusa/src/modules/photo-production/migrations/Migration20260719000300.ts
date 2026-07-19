import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260719000300 extends Migration {
  async up(): Promise<void> {
    this.addSql('create table if not exists "photo_asset_access_audit" ("id" text not null, "asset_id" text not null, "actor_id" text not null, "actor_type" text not null, "action" text not null, "reason" text not null, "request_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_asset_access_audit_pkey" primary key ("id"));')
    this.addSql('create index if not exists "IDX_photo_asset_access_audit_asset_id" on "photo_asset_access_audit" ("asset_id") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_asset_access_audit_deleted_at" on "photo_asset_access_audit" ("deleted_at") where deleted_at is not null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "photo_asset_access_audit" cascade;')
  }
}
