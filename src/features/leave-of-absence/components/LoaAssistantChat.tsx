import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ImagePlus,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import { chatLoaAssistant } from "@/api/loa.functions";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";
import type { LoaForm } from "@/shared/types";
import { localToday } from "../lib/dates";

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  fileName?: string;
  /** The assistant changed the form on this turn. */
  updated?: boolean;
  error?: boolean;
};

const GREETING =
  "Hi! Tell me why you need the leave and the dates you'll be out — and I'll fill in the LOA form for you. You can also attach a photo or PDF of the medical certificate or request and I'll read it.";

const MAX_TURNS = 20;

/** Remembered open/closed choice for the floating chat window. */
const OPEN_KEY = "loa-assistant-open";

/**
 * Floating chatbot for the LOA form, identical in behaviour to the OB one: a
 * round bubble pinned to the bottom-right corner that opens a chat window on
 * top of the page instead of squeezing the layout — so the live preview keeps
 * its full height. Each turn sends the transcript plus the form as it currently
 * stands; the reply carries a short message and, when needed, the fields to
 * apply. Attachments go to Gemini exactly like the DTR biometric import does.
 */
export function LoaAssistantChat({
  form,
  onApply,
}: {
  form: LoaForm;
  onApply: (patch: Partial<LoaForm>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Portals only exist client-side (the page is server-rendered).
  useEffect(() => setMounted(true), []);

  // Restore the open/collapsed choice after hydration.
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {
      /* private mode — just start collapsed */
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(OPEN_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, mounted]);

  // Keep the newest message in view whenever the window (re)opens.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, open]);

  // Grow the composer with what's being typed instead of scrolling inside it.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function send() {
    const text = input.trim();
    if (busy || (!text && !attachment)) return;

    const file = attachment;
    const outgoing: ChatMessage = { role: "user", text, ...(file ? { fileName: file.name } : {}) };
    const next = [...messages, outgoing];
    setMessages(next);
    setInput("");
    setAttachment(null);
    setBusy(true);

    try {
      const image = file
        ? { mimeType: file.type || "application/pdf", base64: await fileToBase64(file) }
        : null;
      const reply = await chatLoaAssistant({
        data: {
          messages: next.slice(-MAX_TURNS).map((m) => ({
            role: m.role,
            text: m.text || (m.fileName ? `Attached: ${m.fileName}` : ""),
          })),
          form,
          // The user's local day, so "today"/"tomorrow" don't drift with the server.
          today: localToday(),
          ...(image ? { image } : {}),
        },
      });

      const changed = Boolean(reply.form);
      if (changed) onApply(reply.form ?? {});
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: reply.reply, ...(changed ? { updated: true } : {}) },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The assistant could not reply.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry — I couldn't process that. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="no-print fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {open ? (
        <section
          className="flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
          aria-label="LOA Assistant chat"
        >
          <header className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-3.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">
                  LOA Assistant
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  Fills the form as you chat
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {messages.length > 0 ? (
                <button
                  type="button"
                  className="btn btn-outline size-7 p-0"
                  aria-label="Clear the conversation"
                  title="Clear the conversation"
                  disabled={busy}
                  onClick={() => setMessages([])}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-outline size-7 p-0"
                aria-label="Hide the assistant"
                title="Hide the assistant"
                onClick={() => setOpen(false)}
              >
                <ChevronDown className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          </header>

          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            className="flex h-56 flex-col gap-2.5 overflow-y-auto p-3 sm:h-72"
          >
            <Bubble message={{ role: "assistant", text: GREETING }} />
            {messages.map((m, i) => (
              <Bubble key={i} message={m} />
            ))}
            {busy ? <TypingBubble /> : null}
          </div>

          <footer className="shrink-0 border-t p-2">
            {attachment ? (
              <div className="mb-1.5 flex items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-[11px]">
                <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Remove attachment"
                  onClick={() => setAttachment(null)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setAttachment(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn btn-outline size-9 shrink-0 p-0"
                aria-label="Attach a photo or PDF"
                title="Attach a photo or PDF of the certificate/request — I'll read it and fill the form"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden="true" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                className="inp max-h-32 min-h-9 flex-1 resize-none overflow-y-auto"
                placeholder="Tell me what the leave is for…"
                aria-label="Message the LOA assistant"
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                type="button"
                className="btn btn-primary size-9 shrink-0 p-0"
                aria-label="Send"
                title="Send"
                disabled={busy || (!input.trim() && !attachment)}
                onClick={() => void send()}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Edits apply to the form straight away — check the preview before printing.
            </p>
          </footer>
        </section>
      ) : null}

      <button
        type="button"
        className="inline-flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-95"
        aria-label={open ? "Hide the LOA assistant" : "Chat with the LOA assistant"}
        aria-expanded={open}
        title={open ? "Hide the assistant" : "LOA Assistant — fill this form by chatting"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="size-5" aria-hidden="true" />
        ) : (
          <Sparkles className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>,
    document.body,
  );
}

function Bubble({ message: m }: { message: ChatMessage }) {
  const mine = m.role === "user";
  return (
    <div className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
      {mine ? null : (
        <span
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Sparkles className="size-3" />
        </span>
      )}
      <div
        className={[
          "max-w-[80%] whitespace-pre-wrap break-words px-3.5 py-2 text-sm leading-relaxed",
          mine
            ? "rounded-2xl rounded-br-md bg-primary text-primary-foreground"
            : m.error
              ? "rounded-2xl rounded-bl-md border border-destructive/40 bg-destructive/10 text-destructive"
              : "rounded-2xl rounded-bl-md bg-muted text-foreground",
        ].join(" ")}
      >
        {m.text}
        {m.fileName ? (
          <span
            className={`mt-1 flex items-center gap-1 text-[11px] ${mine ? "opacity-80" : "text-muted-foreground"}`}
          >
            <Paperclip className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{m.fileName}</span>
          </span>
        ) : null}
        {m.updated ? (
          <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
            <Check className="size-3 shrink-0" aria-hidden="true" />
            Form updated
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Three bouncing dots — the assistant is composing a reply. */
function TypingBubble() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="The assistant is replying">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Sparkles className="size-3" />
      </span>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
        {[0, 0.15, 0.3].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
    </div>
  );
}
