import { Router, type IRouter, type Response as ExpressResponse } from "express";
import { SendCopilotMessageBody, SendCopilotMessageResponse } from "@workspace/api-zod";
import { copilotConversationsTable, copilotMessagesTable, db } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getUserKey } from "../lib/user-scope";

const router: IRouter = Router();
const MODEL = "gemini-3-flash-preview";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;

type GeminiPayload = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const buildGeminiBody = (
  languageInstruction: string,
  context: string,
  message: string,
) => ({
  systemInstruction: {
    parts: [{
      text:
        "You are Vertex AI, the embedded operations copilot inside Vertex OS. " +
        "Treat the workspace context as the only source of truth. " +
        "Use only names, numbers, dates, statuses, and relationships that appear explicitly in that context. " +
        "Never invent records, totals, actions, recommendations presented as facts, or explanations about this workspace. " +
        "Do not use general business knowledge to fill a missing workspace fact. " +
        "If the answer is not directly supported by the context, say that the workspace does not contain enough information and name the missing field. " +
        "For calculations, show the inputs taken from the context and calculate only from those inputs. " +
        "Give a direct answer first, then at most 2 practical next steps when useful. " +
        languageInstruction,
    }],
  },
  contents: [{
    role: "user",
    parts: [{ text: `Workspace context:\n${context}\n\nQuestion:\n${message}` }],
  }],
  generationConfig: {
    maxOutputTokens: 1200,
    temperature: 0.15,
    topP: 0.8,
  },
});

const getLanguageInstruction = (language: "en" | "ar") =>
  language === "ar"
    ? "Use the user's question language for the answer. If the question is Arabic, respond in clear modern Arabic; if it is English, respond in concise professional English. For mixed-language questions, use the dominant language. Keep product names, company names, and currency codes as provided. The interface language is only a fallback when the question language is unclear."
    : "Use the user's question language for the answer. If the question is English, respond in concise professional English; if it is Arabic, respond in clear modern Arabic. For mixed-language questions, use the dominant language. Keep product names, company names, and currency codes as provided. The interface language is only a fallback when the question language is unclear.";

const saveCopilotAnswer = async (
  conversationId: number | undefined,
  message: string,
  answer: string,
) => {
  if (!conversationId) return;
  await db.insert(copilotMessagesTable).values([
    { conversationId, role: "user", content: message },
    { conversationId, role: "assistant", content: answer },
  ]);
  await db.update(copilotConversationsTable)
    .set({ updatedAt: new Date() })
    .where(eq(copilotConversationsTable.id, conversationId));
};

const sendStreamEvent = (res: ExpressResponse, payload: unknown) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const streamGeminiResponse = async (
  response: globalThis.Response,
  res: ExpressResponse,
  onText: (text: string) => void,
) => {
  if (!response.body) throw new Error("Vertex AI returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  const consumeEvent = (event: string) => {
    const dataLine = event.split("\n").find((line) => line.startsWith("data:"));
    if (!dataLine) return;
    const raw = dataLine.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    const payload = JSON.parse(raw) as GeminiPayload;
    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
    if (text) {
      answer += text;
      onText(text);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    events.forEach(consumeEvent);
    if (done) break;
  }
  if (buffer.trim()) consumeEvent(buffer);
  return answer.trim();
};

router.post("/copilot/chat/stream", async (req, res) => {
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

  try {
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
    } else {
      const [conversation] = await db.insert(copilotConversationsTable).values({
        userKey,
        title: message.trim().slice(0, 70),
        language,
      }).returning({ id: copilotConversationsTable.id });
      savedConversationId = conversation.id;
    }

    const response = await fetch(GEMINI_STREAM_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGeminiBody(
        getLanguageInstruction(language),
        context,
        message,
      )),
    });

    if (!response.ok) {
      req.log.error({ status: response.status }, "Vertex AI stream request failed");
      res.status(502).json({ error: "Vertex AI could not answer right now." });
      return;
    }

    res.status(200);
    res.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const answer = await streamGeminiResponse(response, res, (text) => {
      sendStreamEvent(res, { type: "delta", text });
    });
    if (!answer) throw new Error("Vertex AI returned an empty answer.");

    await saveCopilotAnswer(savedConversationId, message, answer);
    sendStreamEvent(res, {
      type: "done",
      result: SendCopilotMessageResponse.parse({
        answer,
        model: MODEL,
        conversationId: savedConversationId,
      }),
    });
    res.end();
  } catch (error) {
    req.log.error({ err: error }, "Vertex AI streaming request failed");
    if (res.headersSent) {
      sendStreamEvent(res, { type: "error", error: "Vertex AI could not answer right now." });
      res.end();
    } else {
      res.status(502).json({ error: "Vertex AI could not answer right now." });
    }
  }
});

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
  const languageInstruction = getLanguageInstruction(language);

  try {
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...buildGeminiBody(languageInstruction, context, message),
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
      await saveCopilotAnswer(savedConversationId, message, answer);
    }

    res.json(SendCopilotMessageResponse.parse({ answer, model: MODEL, conversationId: savedConversationId }));
  } catch (error) {
    req.log.error({ err: error }, "Vertex AI connection failed");
    res.status(502).json({ error: "Vertex AI could not answer right now." });
  }
});

export default router;