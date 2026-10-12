import { integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  preset: text("preset").notNull(),
  stats: jsonb("stats").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const leads = pgTable("leads", {
  id: text("id").notNull(),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  tier: text("tier").notNull(),
  data: jsonb("data").notNull(),
});

export const lookupCache = pgTable("lookup_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
