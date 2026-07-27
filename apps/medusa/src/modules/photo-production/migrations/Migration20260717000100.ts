import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260717000100 extends Migration {
  async up(): Promise<void> {
    this.addSql('create table if not exists "photo_job" ("id" text not null, "guest_owner_hash" text null, "customer_id" text null, "region_id" text not null, "locale" text not null, "currency_code" text not null, "product_handle" text not null, "status" text check ("status" in (\'draft\', \'uploading\', \'ready\', \'failed\', \'cancelled\', \'expired\')) not null default \'draft\', "revision" int not null default 0, "retention_class" text not null, "last_activity_at" timestamptz not null, "upload_started_at" timestamptz null, "ready_at" timestamptz null, "failed_at" timestamptz null, "cancelled_at" timestamptz null, "expired_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_job_pkey" primary key ("id"), constraint "photo_job_owner_check" check (num_nonnulls("guest_owner_hash", "customer_id") = 1));')
    this.addSql('create index if not exists "IDX_photo_job_guest_owner_hash" on "photo_job" ("guest_owner_hash") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_customer_id" on "photo_job" ("customer_id") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_region_id" on "photo_job" ("region_id") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_product_handle" on "photo_job" ("product_handle") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_status" on "photo_job" ("status") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_job_deleted_at" on "photo_job" ("deleted_at") where deleted_at is not null;')

    this.addSql('create table if not exists "photo_asset" ("id" text not null, "job_id" text not null, "display_name" text not null, "object_key" text not null, "reported_mime_type" text null, "detected_mime_type" text null, "expected_bytes" int not null, "stored_bytes" int null, "crc32c" text null, "status" text check ("status" in (\'pending\', \'uploading\', \'uploaded\', \'failed\', \'deleted\')) not null default \'pending\', "failure_code" text null, "upload_started_at" timestamptz null, "uploaded_at" timestamptz null, "failed_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_asset_pkey" primary key ("id"), constraint "photo_asset_job_id_foreign" foreign key ("job_id") references "photo_job" ("id") on update cascade);')
    this.addSql('create unique index if not exists "IDX_photo_asset_object_key_unique" on "photo_asset" ("object_key") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_asset_job_id" on "photo_asset" ("job_id") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_asset_status" on "photo_asset" ("status") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_asset_deleted_at" on "photo_asset" ("deleted_at") where deleted_at is not null;')

    this.addSql('create table if not exists "photo_upload_session" ("id" text not null, "asset_id" text not null, "source_idempotency_key" text not null, "provider_upload_id" text null, "part_size" int not null, "expected_bytes" int not null, "completed_parts" jsonb not null default \'{}\', "status" text check ("status" in (\'active\', \'completed\', \'aborted\', \'expired\')) not null default \'active\', "expires_at" timestamptz not null, "completed_at" timestamptz null, "aborted_at" timestamptz null, "expired_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "photo_upload_session_pkey" primary key ("id"), constraint "photo_upload_session_asset_id_foreign" foreign key ("asset_id") references "photo_asset" ("id") on update cascade);')
    this.addSql('create unique index if not exists "IDX_photo_upload_session_source_idempotency_key_unique" on "photo_upload_session" ("source_idempotency_key") where deleted_at is null;')
    this.addSql('create unique index if not exists "IDX_photo_upload_session_one_active_asset" on "photo_upload_session" ("asset_id") where deleted_at is null and status = \'active\';')
    this.addSql('create index if not exists "IDX_photo_upload_session_asset_id" on "photo_upload_session" ("asset_id") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_upload_session_status" on "photo_upload_session" ("status") where deleted_at is null;')
    this.addSql('create index if not exists "IDX_photo_upload_session_deleted_at" on "photo_upload_session" ("deleted_at") where deleted_at is not null;')
  }

  async down(): Promise<void> {
    this.addSql('drop table if exists "photo_upload_session" cascade;')
    this.addSql('drop table if exists "photo_asset" cascade;')
    this.addSql('drop table if exists "photo_job" cascade;')
  }
}
