import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ReferenceKind } from "@/lib/reference-types";

export const referenceReleases = pgTable("reference_releases", {
  id: uuid("id").defaultRandom().primaryKey(), kind: text("kind").$type<ReferenceKind>().notNull(),
  version: text("version").notNull(), sourceUrl: text("source_url").notNull(), checksum: text("checksum").notNull(),
  sourceModifiedAt: text("source_modified_at"), importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
  rowCount: integer("row_count").notNull(), active: boolean("active").default(false).notNull(),
}, table => [uniqueIndex("reference_releases_kind_checksum_unique").on(table.kind, table.checksum), uniqueIndex("reference_releases_active_unique").on(table.kind).where(sql`${table.active}`), check("reference_releases_kind_check", sql`${table.kind} in ('tuss-20','tuss-22','cid-10','anvisa-medications')`), check("reference_releases_count_check", sql`${table.rowCount} > 0`)]);

export const referenceEntries = pgTable("reference_entries", {
  id: uuid("id").defaultRandom().primaryKey(), releaseId: uuid("release_id").notNull().references(() => referenceReleases.id, { onDelete: "restrict" }),
  code: text("code").notNull(), normalizedCode: text("normalized_code").notNull(), name: text("name").notNull(),
  abbreviatedName: text("abbreviated_name"), laboratory: text("laboratory"), presentation: text("presentation"),
  substance: text("substance"), registrationStatus: text("registration_status"),
  validFrom: date("valid_from", { mode: "string" }), validUntil: date("valid_until", { mode: "string" }),
  active: boolean("active").default(true).notNull(), searchText: text("search_text").notNull(),
}, table => [uniqueIndex("reference_entries_release_code_unique").on(table.releaseId, table.code), index("reference_entries_release_idx").on(table.releaseId), index("reference_entries_code_prefix_idx").on(table.normalizedCode.op("text_pattern_ops")), index("reference_entries_search_idx").using("gin", sql`to_tsvector('simple', ${table.searchText})`), check("reference_entries_dates_check", sql`${table.validFrom} is null or ${table.validUntil} is null or ${table.validFrom} <= ${table.validUntil}`)]);

export const referenceSyncRuns = pgTable("reference_sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(), kind: text("kind").$type<ReferenceKind>().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(), finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), message: text("message"), releaseId: uuid("release_id").references(() => referenceReleases.id),
}, table => [index("reference_sync_runs_kind_started_idx").on(table.kind, table.startedAt), check("reference_sync_runs_status_check", sql`${table.status} in ('running','success','unchanged','failed')`)]);
