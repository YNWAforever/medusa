import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260719000400 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "photo_job" add column if not exists "active_version_id" text null;')
    this.addSql(`create table if not exists "photo_job_version" (
      "id" text not null, "job_id" text not null, "sequence" int not null,
      "source_revision" int not null, "idempotency_key" text not null,
      "status" text check ("status" in ('draft', 'quoted', 'expired')) not null default 'draft',
      "defaults" jsonb not null, "subtotal" int null, "currency_code" text not null,
      "quoted_at" timestamptz null, "quote_expires_at" timestamptz null,
      "manifest_digest" text null, "cart_id" text null, "cart_attached_at" timestamptz null,
      "order_id" text null, "order_frozen_at" timestamptz null,
      "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null, constraint "photo_job_version_pkey" primary key ("id"),
      constraint "photo_job_version_job_id_foreign" foreign key ("job_id") references "photo_job" ("id") on update cascade);`)
    this.addSql('create unique index if not exists "IDX_photo_job_version_job_sequence_unique" on "photo_job_version" ("job_id", "sequence") where deleted_at is null;')
    this.addSql('create unique index if not exists "IDX_photo_job_version_job_idempotency_unique" on "photo_job_version" ("job_id", "idempotency_key") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_version_status" on "photo_job_version" ("status") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_version_deleted_at" on "photo_job_version" ("deleted_at") where deleted_at is not null;')
    this.addSql(`create table if not exists "print_item" (
      "id" text not null, "version_id" text not null, "asset_id" text not null,
      "variant_id" text not null, "sku" text not null,
      "size" text check ("size" in ('4R')) not null default '4R',
      "finish" text check ("finish" in ('glossy', 'matte')) not null,
      "border" text check ("border" in ('none', 'white')) not null,
      "crop_mode" text check ("crop_mode" in ('fill', 'fit')) not null,
      "crop" jsonb not null, "quantity" int not null, "effective_ppi" int not null,
      "quality_band" text check ("quality_band" in ('good', 'caution', 'poor')) not null,
      "warnings" jsonb not null, "warning_acknowledgements" jsonb not null,
      "unit_price_snapshot" int null, "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null,
      constraint "print_item_pkey" primary key ("id"),
      constraint "print_item_version_id_foreign" foreign key ("version_id") references "photo_job_version" ("id") on update cascade,
      constraint "print_item_asset_id_foreign" foreign key ("asset_id") references "photo_asset" ("id") on update cascade);`)
    this.addSql('create unique index if not exists "IDX_print_item_version_asset_unique" on "print_item" ("version_id", "asset_id") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_print_item_deleted_at" on "print_item" ("deleted_at") where deleted_at is not null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "print_item" cascade;')
    this.addSql('drop table if exists "photo_job_version" cascade;')
    this.addSql('alter table "photo_job" drop column if exists "active_version_id";')
  }
}
