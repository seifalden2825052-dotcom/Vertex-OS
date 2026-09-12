import { createInsertSchema } from "drizzle-zod";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const workspaceSnapshotsTable = pgTable("workspace_snapshots", {
  workspaceId: text("workspace_id").primaryKey(),
  owner: text("owner").notNull(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkspaceSnapshotSchema = createInsertSchema(workspaceSnapshotsTable).omit({ updatedAt: true });
export type InsertWorkspaceSnapshot = z.infer<typeof insertWorkspaceSnapshotSchema>;
export type WorkspaceSnapshot = typeof workspaceSnapshotsTable.$inferSelect;