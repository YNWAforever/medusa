import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260711000100 extends Migration {
  async up(): Promise<void> {
    this.addSql('create table if not exists "branch_capability" ("id" text not null, "handle" text not null, "name_en" text not null, "name_zh_hk" text not null, "district_en" text not null, "district_zh_hk" text not null, "pickup_enabled" boolean not null default true, "test_only" boolean not null default true, "lead_time_business_days" int not null, "supported_print_skus" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "branch_capability_pkey" primary key ("id"));')
    this.addSql('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_branch_capability_handle_unique" ON "branch_capability" (handle) WHERE deleted_at IS NULL;')
    this.addSql('CREATE INDEX IF NOT EXISTS "IDX_branch_capability_deleted_at" ON "branch_capability" (deleted_at) WHERE deleted_at IS NOT NULL;')
  }
  async down(): Promise<void> {
    this.addSql('drop table if exists "branch_capability" cascade;')
  }
}
