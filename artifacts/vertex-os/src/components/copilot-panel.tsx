import { useEffect, useMemo, useState } from "react";
import { Bot, History, LoaderCircle, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import {
  useDeleteCopilotConversation,
  useGetCopilotConversation,
  useListCopilotConversations,
} from "@workspace/api-client-react";

type Lang = "en" | "ar";
type Translator = (en: string, ar: string) => string;

type CopilotPanelProps = {
  lang: Lang;
  t: Translator;
  context: string;
  close: () => void;
};

type ConversationItem = {
  role: "assistant" | "user";
  content: string;
};

export function CopilotPanel({ lang, t, context, close }: CopilotPanelProps) {
  const conversationsQuery = useListCopilotConversations();
  const deleteConversation = useDeleteCopilotConversation();
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversation, setConversation] = useState<ConversationItem[]>(() => [
    {
      role: "assistant",
      content: t(
        "I’m Vertex AI. Ask me about revenue, cash runway, customers, projects, or invoices.",
        "أنا Vertex AI. اسألني عن الإيرادات، السيولة، العملاء، المشاريع، أو الفواتير.",
      ),
    },
  ]);
  const activeConversationQuery = useGetCopilotConversation(activeConversationId ?? 0, {
    query: {
      queryKey: ["copilot-conversation", activeConversationId],
      enabled: activeConversationId !== null,
    },
  });

  const suggestions = useMemo(
    () =>
      lang === "ar"
        ? ["ما أكثر شيء يحتاج انتباهي اليوم؟", "حلّل وضع السيولة", "من العملاء المعرضون للخطر؟"]
        : ["What needs my attention today?", "Analyze the cash position", "Which customers are at risk?"],
    [lang],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  useEffect(() => {
    if (!activeConversationQuery.data) return;
    setConversation(activeConversationQuery.data.messages.map((item) => ({
      role: item.role,
      content: item.content,
    })));
  }, [activeConversationQuery.data]);

  const sendMessage = async (trimmed: string, conversationId?: number) => {
    setIsStreaming(true);
    let answer = "";
    const updateAnswer = (content: string) => {
      answer += content;
      setConversation((items) => {
        const next = [...items];
        const lastIndex = next.length - 1;
        if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
          next[lastIndex] = { role: "assistant", content: answer };
        }
        return next;
      });
    };

    try {
      const response = await fetch("/api/copilot/chat/stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          language: lang,
          context,
          conversationId,
        }),
      });
      if (!response.ok || !response.body) {
        throw new Error("Vertex AI request failed");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resultConversationId = conversationId;
      const processEvent = (event: string) => {
        const dataLine = event.split(/\r?\n/).find((line) => line.startsWith("data:"));
        if (!dataLine) return;
        const payload = JSON.parse(dataLine.slice(5).trim()) as {
          type: "delta" | "done" | "error";
          text?: string;
          error?: string;
          result?: { conversationId?: number };
        };
        if (payload.type === "delta" && payload.text) updateAnswer(payload.text);
        if (payload.type === "done") {
          resultConversationId = payload.result?.conversationId ?? conversationId;
        }
        if (payload.type === "error") throw new Error(payload.error ?? "Vertex AI request failed");
      };

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        lines.forEach((line) => {
          if (line.startsWith("data:")) processEvent(line);
        });
        if (done) break;
      }
      if (buffer.trim()) processEvent(buffer);
      if (!answer) throw new Error("Vertex AI returned an empty answer");
      setActiveConversationId(resultConversationId ?? null);
      conversationsQuery.refetch();
    } catch {
      setConversation((items) => {
        const next = [...items];
        const lastIndex = next.length - 1;
        const errorMessage = t(
          "Vertex AI is unavailable right now. Check the Gemini key and try again.",
          "Vertex AI غير متاح الآن. راجع مفتاح Gemini وحاول مرة أخرى.",
        );
        if (lastIndex >= 0 && next[lastIndex].role === "assistant") {
          next[lastIndex] = { role: "assistant", content: answer || errorMessage };
        }
        return next;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const submit = (value = message) => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming) return;

    setConversation((items) => [...items, { role: "user", content: trimmed }]);
    setConversation((items) => [...items, { role: "assistant", content: "" }]);
    setMessage("");
    sendMessage(trimmed, activeConversationId ?? undefined);
  };

  const startNewConversation = () => {
    setActiveConversationId(null);
    setShowHistory(false);
    setConversation([{
      role: "assistant",
      content: t(
        "I’m Vertex AI. Ask me about revenue, cash runway, customers, projects, or invoices.",
        "أنا Vertex AI. اسألني عن الإيرادات، السيولة، العملاء، المشاريع، أو الفواتير.",
      ),
    }]);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        className="absolute inset-0 bg-[#102c30]/30 backdrop-blur-[2px]"
        onClick={close}
        aria-label={t("Close Vertex AI", "إغلاق Vertex AI")}
      />
      <section className="relative flex h-full w-full max-w-[430px] flex-col border-s border-border bg-background shadow-2xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold">Vertex AI</h2>
              <span className="rounded-full bg-[#dcefe7] px-2 py-0.5 text-[9px] font-bold text-[#27735d] dark:bg-[#193d35] dark:text-[#8bd4bd]">
                {t("Context aware", "يفهم سياقك")}
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowHistory((visible) => !visible)}
            className={`rounded-lg p-2 hover:bg-secondary hover:text-foreground ${showHistory ? "bg-secondary text-primary" : "text-muted-foreground"}`}
            aria-label={t("View conversation history", "عرض سجل المحادثات")}
          >
            <History size={17} />
          </button>
          <button
            onClick={close}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={t("Close Vertex AI", "إغلاق Vertex AI")}
          >
            <X size={17} />
          </button>
        </header>

        {showHistory && (
          <div className="border-b border-border bg-card/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">
                {t("Saved conversations", "المحادثات المحفوظة")}
              </p>
              <button
                onClick={startNewConversation}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/[.08]"
              >
                <Plus size={13} />
                {t("New", "جديدة")}
              </button>
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {conversationsQuery.data?.conversations.map((item) => (
                <div key={item.id} className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setActiveConversationId(item.id);
                      setShowHistory(false);
                    }}
                    className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-start text-[11px] font-medium hover:bg-secondary ${activeConversationId === item.id ? "bg-secondary text-primary" : "text-foreground"}`}
                  >
                    {item.title}
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(t(
                        "Delete this conversation permanently?",
                        "هل تريد حذف هذه المحادثة نهائيًا؟",
                      ))) return;
                      deleteConversation.mutate(
                        { conversationId: item.id },
                        {
                          onSuccess: () => {
                            conversationsQuery.refetch();
                            if (activeConversationId === item.id) startNewConversation();
                          },
                        },
                      );
                    }}
                    disabled={deleteConversation.isPending}
                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    aria-label={t("Delete conversation", "حذف المحادثة")}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {conversationsQuery.data?.conversations.length === 0 && (
                <p className="px-2.5 py-3 text-[11px] text-muted-foreground">
                  {t("Your saved conversations will appear here.", "ستظهر محادثاتك المحفوظة هنا.")}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-2xl border border-primary/15 bg-primary/[.055] p-3.5 text-[11px] leading-relaxed text-foreground">
            <div className="mb-2 flex items-center gap-2 font-bold text-primary">
              <Bot size={14} />
              {t("Workspace intelligence", "ذكاء مساحة العمل")}
            </div>
            {t(
              "I can reason over the live business snapshot in this workspace and turn signals into next actions.",
              "أقدر أحلل صورة العمل الحالية وأحوّل المؤشرات إلى خطوات عملية.",
            )}
          </div>

          {conversation.map((item, index) => (
            <div key={`${item.role}-${index}`} className={`flex gap-2.5 ${item.role === "user" ? "justify-end" : ""}`}>
              {item.role === "assistant" && (
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Sparkles size={13} />
                </div>
              )}
              <div
                className={`max-w-[86%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-xs leading-relaxed ${
                  item.role === "user"
                    ? "rounded-ee-md bg-primary text-primary-foreground"
                    : "rounded-es-md bg-secondary text-foreground"
                }`}
              >
                {item.content}
              </div>
            </div>
          ))}

          {isStreaming && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <LoaderCircle size={14} className="animate-spin text-primary" />
              {t("Analyzing your workspace…", "جاري تحليل مساحة العمل…")}
            </div>
          )}

          {conversation.length === 1 && (
            <div className="space-y-2 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">
                {t("Try asking", "جرّب أن تسأل")}
              </p>
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => submit(suggestion)}
                  className="block w-full rounded-xl border border-border px-3 py-2.5 text-start text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-secondary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          className="border-t border-border bg-card/60 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 focus-within:border-primary/50">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("Ask Vertex AI…", "اسأل Vertex AI…")}
              className="max-h-24 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2 text-xs outline-none placeholder:text-muted-foreground"
              rows={1}
              aria-label={t("Ask Vertex AI", "اسأل Vertex AI")}
            />
            <button
              type="submit"
              disabled={!message.trim() || isStreaming}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t("Send message", "إرسال الرسالة")}
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-2 text-center text-[9px] text-muted-foreground">
            {t("Vertex AI uses the current workspace context.", "Vertex AI يستخدم سياق مساحة العمل الحالية.")}
          </p>
        </form>
      </section>
    </div>
  );
}