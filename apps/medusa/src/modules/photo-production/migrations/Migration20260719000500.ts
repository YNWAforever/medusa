import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260719000500 extends Migration {
  async up(): Promise<void> {
    this.addSql('alter table "photo_job" drop constraint if exists "photo_job_status_check";')
    this.addSql(`alter table "photo_job" add constraint "photo_job_status_check" check ("status" in ('draft', 'uploading', 'ready', 'cart_attached', 'ordered', 'failed', 'cancelled', 'expired'));`)
  }

  async down(): Promise<void> {
    this.addSql('alter table "photo_job" drop constraint if exists "photo_job_status_check";')
    this.addSql(`alter table "photo_job" add constraint "photo_job_status_check" check ("status" in ('draft', 'uploading', 'ready', 'failed', 'cancelled', 'expired'));`)
  }
}
