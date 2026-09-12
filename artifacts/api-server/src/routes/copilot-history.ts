import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  CreateCopilotConversationBody,
  CreateCopilotConversationResponse,
  GetCopilotConversationParams,
  GetCopilotConversationResponse,
  ListCopilotConversationsResponse,
} from "@workspace/api-zod";
import { copilotConversationsTable, copilotMessagesTable, db } from "@workspace/db";
import { getUserKey } from "../lib/user-scope";

const router: IRouter = Router();

router.get("/copilot/conversations", async (req, res) => {
  try {
    const userKey = getUserKey(req, res);
    const conversations = await db
      .select()
      .from(copilotConversationsTable)
      .where(eq(copilotConversationsTable.userKey, userKey))
      .orderBy(desc(copilotConversationsTable.updatedAt));
    res.json(ListCopilotConversationsResponse.parse({ conversations }));
  } catch (error) {
    req.log.error({ err: error }, "Copilot conversation list failed");
    res.status(503).json({ error: "Saved conversations are temporarily unavailable." });
  }
});

router.post("/copilot/conversations", async (req, res) => {
  const parsed = CreateCopilotConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a valid conversation language." });
    return;
  }

  try {
    const userKey = getUserKey(req, res);
    const [conversation] = await db.insert(copilotConversationsTable).values({
      userKey,
      title: parsed.data.title || (parsed.data.language === "ar" ? "محادثة جديدة" : "New conversation"),
      language: parsed.data.language,
    }).returning();
    res.status(201).json(CreateCopilotConversationResponse.parse(conversation));
  } catch (error) {
    req.log.error({ err: error }, "Copilot conversation creation failed");
    res.status(503).json({ error: "A new conversation could not be created." });
  }
});

router.get("/copilot/conversations/:conversationId", async (req, res) => {
  const parsed = GetCopilotConversationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid conversation ID." });
    return;
  }

  try {
    const userKey = getUserKey(req, res);
    const [conversation] = await db
      .select()
      .from(copilotConversationsTable)
      .where(eq(copilotConversationsTable.id, parsed.data.conversationId))
      .limit(1);
    if (!conversation || conversation.userKey !== userKey) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }

    const messages = await db
      .select()
      .from(copilotMessagesTable)
      .where(eq(copilotMessagesTable.conversationId, conversation.id))
      .orderBy(asc(copilotMessagesTable.createdAt), asc(copilotMessagesTable.id));
    res.json(GetCopilotConversationResponse.parse({ ...conversation, messages }));
  } catch (error) {
    req.log.error({ err: error }, "Copilot conversation read failed");
    res.status(503).json({ error: "Conversation history is temporarily unavailable." });
  }
});

router.delete("/copilot/conversations/:conversationId", async (req, res) => {
  const parsed = GetCopilotConversationParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid conversation ID." });
    return;
  }

  try {
    const userKey = getUserKey(req, res);
    const deleted = await db
      .delete(copilotConversationsTable)
      .where(and(
        eq(copilotConversationsTable.id, parsed.data.conversationId),
        eq(copilotConversationsTable.userKey, userKey),
      ))
      .returning({ id: copilotConversationsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    res.status(204).send();
  } catch (error) {
    req.log.error({ err: error }, "Copilot conversation deletion failed");
    res.status(503).json({ error: "Conversation could not be deleted." });
  }
});

export default router;