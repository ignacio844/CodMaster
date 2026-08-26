import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  userId: text('user_id').primaryKey(), email: text('email').notNull().unique(), displayName: text('display_name').notNull(), role: text('role').notNull().default('VIEWER'), system: text('system'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const imports = pgTable('imports', {
  id: text('id').primaryKey(), source: text('source').notNull(), filename: text('filename').notNull(), uploaderId: text('uploader_id').notNull(), rowCount: integer('row_count').notNull(), matchedCount: integer('matched_count').notNull(), reviewCount: integer('review_count').notNull(), orphanCount: integer('orphan_count').notNull(), objectKey: text('object_key').notNull(), resultKey: text('result_key').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('imports_created_idx').on(table.createdAt)]);
export const decisions = pgTable('decisions', {
  id: text('id').primaryKey(), importId: text('import_id').notNull(), rowId: text('row_id').notNull(), source: text('source').notNull(), sourceCode: text('source_code').notNull(), crmCode: text('crm_code').notNull(), score: integer('score').notNull(), status: text('status').notNull(), reviewerId: text('reviewer_id').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('decision_import_row_unique').on(table.importId, table.rowId), index('decisions_import_idx').on(table.importId)]);
export const settings = pgTable('settings', { key: text('key').primaryKey(), value: text('value').notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow() });
