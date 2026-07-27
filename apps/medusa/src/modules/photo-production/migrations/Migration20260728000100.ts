import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Phase 2C import sessions.
 *
 * Named for 2026-07-28 rather than the plan's 20260711000300, which would sort
 * before every Phase 2B migration and run out of order against an existing
 * database.
 *
 * `credentials_ciphertext` is the only place a provider credential may live, and
 * it is always sealed by ProviderTokenVault. There is deliberately no plaintext
 * token or link column for one to leak into.
 */
export class Migration20260728000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(`create table if not exists "photo_import_session" (
      "id" text not null,
      "job_id" text not null,
      "source_type" text check ("source_type" in ('device', 'google_photos', 'dropbox')) not null,
      "provider_session_id" text null,
      "source_idempotency_key" text not null,
      "credentials_ciphertext" text null,
      "credentials_key_version" integer null,
      "credentials_cleared_at" timestamptz null,
      "selection_state" text check ("selection_state" in ('pending', 'selected', 'importing', 'completed', 'cancelled', 'expired')) not null default 'pending',
      "selected_count" integer not null default 0,
      "imported_count" integer not null default 0,
      "failed_count" integer not null default 0,
      "expires_at" timestamptz not null,
      "completed_at" timestamptz null,
      "cancelled_at" timestamptz null,
      "created_at" timestamptz not null default now(),
      "updated_at" timestamptz not null default now(),
      "deleted_at" timestamptz null,
      constraint "photo_import_session_pkey" primary key ("id")
    );`)

    this.addSql(
      'alter table "photo_import_session" drop constraint if exists "photo_import_session_job_id_foreign";',
    )
    // `on update cascade` only, matching what MikroORM derives from the model
    // and how photo_asset and photo_job_version already reference photo_job.
    // Adding `on delete cascade` here would show up as drift on every
    // db:generate.
    this.addSql(`alter table "photo_import_session"
      add constraint "photo_import_session_job_id_foreign"
      foreign key ("job_id") references "photo_job" ("id") on update cascade;`)

    this.addSql(
      'create unique index if not exists "IDX_photo_import_session_source_idempotency_key_unique" on "photo_import_session" ("source_idempotency_key") where "deleted_at" is null;',
    )
    this.addSql(
      'create index if not exists "IDX_photo_import_session_job_id" on "photo_import_session" ("job_id") where "deleted_at" is null;',
    )
    this.addSql(
      'create index if not exists "IDX_photo_import_session_deleted_at" on "photo_import_session" ("deleted_at") where "deleted_at" is null;',
    )
    this.addSql(
      'create index if not exists "IDX_photo_import_session_selection_state" on "photo_import_session" ("selection_state") where "deleted_at" is null;',
    )
    this.addSql(
      'create index if not exists "IDX_photo_import_session_source_type" on "photo_import_session" ("source_type") where "deleted_at" is null;',
    )
    // Drives credential disposal: sessions still holding a sealed secret.
    this.addSql(
      'create index if not exists "IDX_photo_import_session_credentials_pending" on "photo_import_session" ("expires_at") where "credentials_ciphertext" is not null and "credentials_cleared_at" is null;',
    )
  }

  /**
   * Symmetric: the table did not exist before this migration, so dropping it
   * restores the prior schema exactly. No data mutation to reverse.
   */
  async down(): Promise<void> {
    this.addSql('drop table if exists "photo_import_session" cascade;')
  }
}
