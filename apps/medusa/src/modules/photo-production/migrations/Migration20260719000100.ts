import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260719000100 extends Migration {
  async up(): Promise<void> {
    this.addSql(
      'alter table "photo_asset" add column if not exists "provider_cleanup_completed_at" timestamptz null;',
    );
    this.addSql(
      'create index if not exists "IDX_photo_asset_cleanup_pending" on "photo_asset" ("updated_at") where deleted_at is null and status = \'deleted\' and provider_cleanup_completed_at is null;',
    );
  }

  async down(): Promise<void> {
    this.addSql('drop index if exists "IDX_photo_asset_cleanup_pending";');
    this.addSql(
      'alter table "photo_asset" drop column if exists "provider_cleanup_completed_at";',
    );
  }
}
