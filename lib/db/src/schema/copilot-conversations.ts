import { createInsertSchema } from "drizzle-zod";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const copilotConversationsTable = pgTable("copilot_conversations", {
  id: serial("id").primaryKey(),
  userKey: text("user_key").notNull().default("legacy"),
  title: text("title").notNull(),
  language: text("language").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const copilotMessagesTable = pgTable("copilot_messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => copilotConversationsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCopilotConversationSchema = createInsertSchema(copilotConversationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCopilotMessageSchema = createInsertSchema(copilotMessagesTable).omit({ id: true, createdAt: true });
export type InsertCopilotConversation = z.infer<typeof insertCopilotConversationSchema>;
export type InsertCopilotMessage = z.infer<typeof insertCopilotMessageSchema>;
export type CopilotConversation = typeof copilotConversationsTable.$inferSelect;
export type CopilotMessage = typeof copilotMessagesTable.$inferSelect;