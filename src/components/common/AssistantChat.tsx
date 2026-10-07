import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ImagePlus, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";

import { AiLauncher } from "./AiLauncher";
import { AiMascot } from "./AiMascot";
import { QuickStartChips, type QuickStartOption } from "./QuickStartChips";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";

/** One turn in an assistant transcript. */
export type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  /** Name of a file attached to this turn, shown under the text. */
  fileName?: string;
  /** The assistant changed the form on this turn. */
  updated?: boolean;
  /** The turn failed — render the bubble in the destructive style. */
  error?: boolean;
  /** Wall-clock time the turn was recorded, e.g. "1:11 PM". */
  time?: string;
};

/** What the widget hands to a form-specific caller for every turn it sends. */
export type AssistantSubmit = {
  /** The transcript so far (with "Attached: name" in place of the file), oldest first. */
  messages: { role: "user" | "assistant"; text: string }[];
  /** Base64 payload of the attachment, when the user added one. */
  image: { mimeType: string; base64: string } | null;
  /** The user's local day (YYYY-MM-DD), so "today"/"tomorrow" resolve correctly. */
  today: string;
};

/** How much of the transcript is replayed to the model. */
const MAX_TURNS = 20;

/**
 * The one floating chatbot every form shares (LOA, OB, OT, COS). A round bubble
 * pinned to the bottom-right corner opens a chat window on top of the page
 * instead of squeezing the layout, so the live preview keeps its full height.
 *
 * The window is the same shell in all four forms — orange header with an
 * "Online" status, a "Today" divider, white bordered bubbles with the assistant
 * name and time under each reply, the QUICK START chips, and a pill composer
 * with the brand-orange send button. Only the copy (title, greeting, starters,
 * hints, placeholder) and the API call differ, so those arrive as props and the
 * per-form files stay thin wrappers around this component.
 *
 * Each turn builds the transcript plus any attachment, then calls `onSubmit`,
 * which performs the server request and applies the returned patch. This
 * component only owns presentation and the chat's own state.
 */
export function AssistantChat({
  title,
  subtitle = "Fills the form as you chat",
  ariaLabel,
  storageKey,
  greeting,
  quickStart,
  hints,
  placeholder,
  attachTitle,
  launcherLabel,
  launcherOpenLabel,
  onSubmit,
}: {
  /** Heading in the orange header, e.g. "LOA Assistant". */
  title: string;
  /** The line after "Online •" under the heading. */
  subtitle?: string;
  /** Accessible name for the chat window, e.g. "LOA Assistant chat". */
  ariaLabel: string;
  /** localStorage key remembering whether the window was left open. */
  storageKey: string;
  /** The assistant's opening bubble. */
  greeting: string;
  /** One-click starters shown under the first bubble. */
  quickStart: QuickStartOption[];
  /** Rotating nudges on the launcher's speech bubble. */
  hints: readonly string[];
  /** Composer placeholder. */
  placeholder: string;
  /** Hover text for the attach button. */
  attachTitle: string;
  /** Accessible name for the closed launcher. */
  launcherLabel: string;
  /** Accessible name for the open launcher. */
  launcherOpenLabel: string;
  /** Runs the turn and reports the reply (and whether the form changed). */
  onSubmit: (submit: AssistantSubmit) => Promise<{ reply: string; changed: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [mounted, setMounted] = useState(false);
  // Captured once so the opening bubble keeps a stable timestamp.
  const [greetingTime] = useState(nowLabel);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Portals only exist client-side (the page is server-rendered).
  useEffect(() => setMounted(true), []);

  // Restore the open/collapsed choice after hydration.
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "1") setOpen(true);
    } catch {
      /* private mode — just start collapsed */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open, storageKey, mounted]);

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

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (busy || (!text && !attachment)) return;

    const file = attachment;
    const outgoing: AssistantMessage = {
      role: "user",
      text,
      time: nowLabel(),
      ...(file ? { fileName: file.name } : {}),
    };
    const next = [...messages, outgoing];
    setMessages(next);
    // A quick-start chip sends a canned prompt; keep any half-typed draft.
    if (preset === undefined) setInput("");
    setAttachment(null);
    setBusy(true);

    try {
      const image = file
        ? { mimeType: file.type || "application/pdf", base64: await fileToBase64(file) }
        : null;
      const reply = await onSubmit({
        messages: next.slice(-MAX_TURNS).map((m) => ({
          role: m.role,
          text: m.text || (m.fileName ? `Attached: ${m.fileName}` : ""),
        })),
        image,
        today: localToday(),
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: reply.reply,
          time: nowLabel(),
          ...(reply.changed ? { updated: true } : {}),
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The assistant could not reply.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: "Sorry — I couldn't process that. Please try again.",
          time: nowLabel(),
          error: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // Quick-start chips: attachments open the picker, the rest send their prompt.
  function pickQuickStart(option: QuickStartOption) {
    if (busy) return;
    if (option.attach) {
      fileRef.current?.click();
      return;
    }
    void send(option.prompt ?? option.label);
  }

  if (!mounted) return null;

  return createPortal(
    <div className="no-print fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 sm:bottom-5 sm:right-5">
      {open ? (
        <section
          className="flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-200"
          aria-label={ariaLabel}
        >
          <header className="flex shrink-0 items-center justify-between gap-2 bg-linear-to-br from-regasco-light via-regasco to-regasco-deep px-3 py-2.5 text-white">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/95 shadow-sm">
                <AiMascot size="md" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold leading-tight">{title}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-none text-white/85">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_0_2px_rgba(255,255,255,0.25)]"
                  />
                  <span className="font-medium">Online</span>
                  <span aria-hidden="true" className="text-white/45">
                    •
                  </span>
                  <span className="truncate">{subtitle}</span>
                </span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {messages.length > 0 ? (
                <button
                  type="button"
                  className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 disabled:opacity-50"
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
                className="flex size-8 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
                aria-label="Hide the assistant"
                title="Hide the assistant"
                onClick={() => setOpen(false)}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </span>
          </header>

          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            className="flex h-64 flex-col gap-3 overflow-y-auto bg-background px-3 py-3.5 sm:h-80"
          >
            <DayDivider label="Today" />
            <Bubble
              message={{ role: "assistant", text: greeting, time: greetingTime }}
              title={title}
            />
            {messages.length === 0 ? (
              <QuickStartChips options={quickStart} disabled={busy} onPick={pickQuickStart} />
            ) : null}
            {messages.map((m, i) => (
              <Bubble key={i} message={m} index={i} title={title} />
            ))}
            {busy ? <TypingBubble /> : null}
          </div>

          <footer className="shrink-0 border-t border-border bg-card p-2.5">
            {attachment ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-[11px]">
                <Paperclip className="size-3 shrink-0 text-regasco" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="Remove attachment"
                  onClick={() => setAttachment(null)}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            ) : null}

            <div className="flex items-end gap-2">
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
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-regasco transition-colors hover:bg-regasco/10 disabled:opacity-50"
                aria-label="Attach a photo or PDF"
                title={attachTitle}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-5" aria-hidden="true" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                className="min-h-9 max-h-32 flex-1 resize-none overflow-y-auto rounded-[1.25rem] border border-border bg-background px-4 py-2 text-sm leading-snug text-foreground outline-none transition placeholder:text-muted-foreground focus:border-regasco/60 focus:ring-4 focus:ring-regasco/15"
                placeholder={placeholder}
                aria-label="Message the assistant"
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
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-regasco text-white shadow-sm transition hover:brightness-105 disabled:opacity-50"
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
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">
              Edits apply to the form straight away — check the preview before printing.
            </p>
          </footer>
        </section>
      ) : null}

      <AiLauncher
        open={open}
        onToggle={() => setOpen((v) => !v)}
        label={launcherLabel}
        openLabel={launcherOpenLabel}
        hint={hints}
      />
    </div>,
    document.body,
  );
}

/** The centred "Today" rule above the first bubble. */
function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-foreground/[0.06] px-3 py-0.5 text-[10px] font-medium text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function Bubble({
  message: m,
  index = 0,
  title,
}: {
  message: AssistantMessage;
  index?: number;
  title: string;
}) {
  const mine = m.role === "user";
  return (
    <div
      className={`ai-message-in flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}
      // Only the newest rows stagger; an older transcript is already settled.
      style={{ animationDelay: `${Math.min(index, 4) * 45}ms` }}
    >
      {mine ? null : <AiMascot size="sm" />}
      <div className={`flex max-w-[80%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
        <div
          className={[
            "w-fit whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
            mine
              ? "rounded-br-md bg-regasco text-white"
              : m.error
                ? "rounded-bl-md border border-destructive/40 bg-destructive/10 text-destructive shadow-none"
                : "rounded-bl-md border border-border bg-card text-foreground",
          ].join(" ")}
        >
          {m.text}
          {m.fileName ? (
            <span
              className={`mt-1 flex items-center gap-1 text-[11px] ${mine ? "text-white/80" : "text-muted-foreground"}`}
            >
              <Paperclip className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{m.fileName}</span>
            </span>
          ) : null}
          {m.updated ? (
            <span
              className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${mine ? "text-white/90" : "text-regasco-deep"}`}
            >
              <Check className="size-3 shrink-0" aria-hidden="true" />
              Form updated
            </span>
          ) : null}
        </div>
        {m.time ? (
          <span className="px-1 text-[10px] text-muted-foreground">
            {mine ? m.time : `${title} · ${m.time}`}
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
      <AiMascot size="sm" float />
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-md border border-border bg-card px-3.5 py-2.5 shadow-sm">
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

/** Wall-clock time for a turn, e.g. "1:11 PM". */
function nowLabel(): string {
  return new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** The user's local calendar day as YYYY-MM-DD. */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
