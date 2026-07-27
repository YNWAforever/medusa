import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260719000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "photo_asset" add column if not exists "provider_cleanup_completed_at" timestamptz null;',
    );
    this.addSql(
      'update "photo_asset" set "deleted_at" = null where "status" = \'deleted\' and "deleted_at" is not null;',
    );
    this.addSql(
      'update "photo_upload_session" as s set "source_idempotency_key" = a."job_id" || \':\' || s."source_idempotency_key" from "photo_asset" as a where s."asset_id" = a."id";',
    );
    this.addSql(
      'create index if not exists "IDX_photo_asset_cleanup_pending" on "photo_asset" ("updated_at") where status = \'deleted\' and provider_cleanup_completed_at is null;',
    );
  }

  /**
   * The two `update` statements in `up()` are not reversed.
   *
   * Clearing `deleted_at` is intentional, not an oversight: the cleanup index
   * above matches on `status = 'deleted'`, and Medusa's soft-delete filter
   * (`deleted_at is null`) would hide exactly the rows the cleanup job needs to
   * find. This migration moves deletion tracking from the ORM's soft-delete to
   * `status` plus `provider_cleanup_completed_at`.
   *
   * It touches no rows in a real deployment — `photo_asset` is created by
   * Migration20260717000100, two migrations earlier in this same phase — so the
   * asymmetry only affects a development database that accumulated soft-deleted
   * assets mid-phase.
   */
  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_photo_asset_cleanup_pending";');
    this.addSql(
      'alter table "photo_asset" drop column if exists "provider_cleanup_completed_at";',
    );
  }
}
