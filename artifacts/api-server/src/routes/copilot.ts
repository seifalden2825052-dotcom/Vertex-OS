import { Router, type IRouter } from "express";
import { SendCopilotMessageBody, SendCopilotMessageResponse } from "@workspace/api-zod";
import { copilotConversationsTable, copilotMessagesTable, db } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getUserKey } from "../lib/user-scope";

const router: IRouter = Router();
const MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

router.post("/copilot/chat", async (req, res) => {
  const parsed = SendCopilotMessageBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Please provide a message, language, and workspace context." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.length < 20 || /[^\x00-\x7F]/.test(apiKey)) {
    res.status(503).json({ error: "Add a valid Gemini API key in the secure secrets form to use Vertex AI." });
    return;
  }

  const { message, language, context, conversationId } = parsed.data;
  const userKey = getUserKey(req, res);
  let savedConversationId = conversationId;
  if (conversationId) {
    const [ownedConversation] = await db
      .select({ id: copilotConversationsTable.id })
      .from(copilotConversationsTable)
      .where(and(
        eq(copilotConversationsTable.id, conversationId),
        eq(copilotConversationsTable.userKey, userKey),
      ))
      .limit(1);
    if (!ownedConversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
  }
  if (savedConversationId === undefined) {
    const [conversation] = await db.insert(copilotConversationsTable).values({
      userKey,
      title: message.trim().slice(0, 70),
      language,
    }).returning({ id: copilotConversationsTable.id });
    savedConversationId = conversation.id;
  }
  const languageInstruction =
    language === "ar"
      ? "Use the user's question language for the answer. If the question is Arabic, respond in clear modern Arabic; if it is English, respond in concise professional English. For mixed-language questions, use the dominant language. Keep product names, company names, and currency codes as provided. The interface language is only a fallback when the question language is unclear."
      : "Use the user's question language for the answer. If the question is English, respond in concise professional English; if it is Arabic, respond in clear modern Arabic. For mixed-language questions, use the dominant language. Keep product names, company names, and currency codes as provided. The interface language is only a fallback when the question language is unclear.";

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{
            text:
              "You are Vertex AI, the embedded operations copilot inside Vertex OS. " +
              "Use only the workspace context supplied by the user. Never invent records, totals, or actions. " +
              "Give a direct answer first, then 2-4 practical next steps when useful. " +
              "If the context does not contain enough information, say exactly what is missing. " +
              languageInstruction,
          }],
        },
        contents: [{
          role: "user",
          parts: [{ text: `Workspace context:\n${context}\n\nQuestion:\n${message}` }],
        }],
        generationConfig: {
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      req.log.error({ status: response.status }, "Vertex AI request failed");
      res.status(502).json({ error: "Vertex AI could not answer right now." });
      return;
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const answer = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!answer) {
      res.status(502).json({ error: "Vertex AI returned an empty answer." });
      return;
    }

    if (savedConversationId) {
      await db.insert(copilotMessagesTable).values([
        { conversationId: savedConversationId, role: "user", content: message },
        { conversationId: savedConversationId, role: "assistant", content: answer },
      ]);
      await db.update(copilotConversationsTable)
        .set({ updatedAt: new Date() })
        .where(eq(copilotConversationsTable.id, savedConversationId));
    }

    res.json(SendCopilotMessageResponse.parse({ answer, model: MODEL, conversationId: savedConversationId }));
  } catch (error) {
    req.log.error({ err: error }, "Vertex AI connection failed");
    res.status(502).json({ error: "Vertex AI could not answer right now." });
  }
});

export default router;