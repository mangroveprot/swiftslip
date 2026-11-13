import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ImagePlus, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";

import { AiLauncher } from "./AiLauncher";
import { AiMascot } from "./AiMascot";
import { QuickStartChips, type QuickStartOption } from "./QuickStartChips";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  prepareAttachment,
} from "@/lib/attachment-upload";
import { fileToBase64 } from "@/lib/file";
import { toast } from "@/lib/toast";

/** One turn in an assistant transcript. */
export type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  /** Name of the single file attached to this turn, shown under the text. */
  fileName?: string;
  /** Names of several files sent together (the LIQ assistant's receipts). */
  fileNames?: string[];
  /** The assistant changed the form on this turn. */
  updated?: boolean;
  /** The turn failed, render the bubble in the destructive style. */
  error?: boolean;
  /** Wall-clock time the turn was recorded, e.g. "1:11 PM". */
  time?: string;
};

/** What the widget hands to a form-specific caller for every turn it sends. */
export type AssistantSubmit = {
  /** The transcript so far (with "Attached: name" in place of the file), oldest first. */
  messages: { role: "user" | "assistant"; text: string }[];
  /** Base64 payload of the first attachment (`images[0] ?? null`). */
  image: { mimeType: string; base64: string } | null;
  /** Every attachment on this turn, in pick order, at most `maxAttachments`. */
  images: { mimeType: string; base64: string }[];
  /** The user's local day (YYYY-MM-DD), so "today"/"tomorrow" resolve correctly. */
  today: string;
};

/** What the composer accepts: any picture the browser renders, or a PDF. */
function isChatFile(file: File): boolean {
  if (file.type.startsWith("image/") || file.type === "application/pdf") return true;
  // Windows often reports an empty type; judge the extension instead.
  return !file.type && /\.(pdf|png|jpe?g|gif|webp|bmp)$/i.test(file.name);
}

/** The transcript line that stands in for a turn's attachments. */
function attachedLabel(m: AssistantMessage): string {
  const names = m.fileNames?.length ? m.fileNames : m.fileName ? [m.fileName] : [];
  return names.length ? `Attached: ${names.join(", ")}` : "";
}

/** How much of the transcript is replayed to the model. */
const MAX_TURNS = 20;

/**
 * The one floating chatbot every form shares (LOA, OB, OT, COS). A round bubble
 * pinned to the bottom-right corner opens a chat window on top of the page
 * instead of squeezing the layout, so the live preview keeps its full height.
 *
 * The window is the same shell in all four forms, orange header with an
 * "Online" status, a "Today" divider, white bordered bubbles with the assistant
 * name and time under each reply, the QUICK START chips, and a pill composer
 * with the brand-orange send button. Only the copy (title, greeting, starters,
 * hints, placeholder) and the API call differ, so those arrive as props and the
 * per-form files stay thin wrappers around this component.
 *
 * Each turn builds the transcript plus any attachments, then calls `onSubmit`,
 * which performs the server request and applies the returned patch. This
 * component only owns presentation and the chat's own state.
 *
 * A turn normally carries one photo or PDF, but some forms come back with
 * several at once, a trip's receipts, say, so `maxAttachments` widens the
 * composer to a small list (10 MB each). `compressImages` downscales every
 * picture before it is base64-encoded, which is what lets five receipts fit in
 * a single request; a PDF always travels byte for byte.
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
  maxAttachments = 1,
  compressImages = false,
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
  /** Most files one turn may carry, the default keeps a single attachment. */
  maxAttachments?: number;
  /** Downscale pictures before encoding them (several receipts in one request). */
  compressImages?: boolean;
  /** Runs the turn and reports the reply (and whether the form changed). */
  onSubmit: (submit: AssistantSubmit) => Promise<{ reply: string; changed: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
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
      /* private mode, just start collapsed */
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
  // `auto` first so the box can shrink again, and re-run on open: the textarea
  // only exists once the window is mounted, so measuring on mount alone left it
  // at its CSS height while the placeholder wrapped out of it.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [input, open]);

  /**
   * Queue picked or pasted files while respecting the cap. With the default
   * single slot a new pick swaps the current file, exactly as before; with
   * several slots the list fills up and anything past the cap is dropped
   * rather than silently pushing someone's receipt out.
   */
  function addFiles(picked: File[]) {
    if (busy || picked.length === 0) return;
    const sendable: File[] = [];
    for (const file of picked) {
      if (!isChatFile(file)) {
        toast.error(`${file.name} is not a photo or PDF.`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast.error(`${file.name} is larger than ${MAX_ATTACHMENT_MB} MB.`);
        continue;
      }
      sendable.push(file);
    }
    if (sendable.length === 0) return;
    const last = sendable[sendable.length - 1];
    if (!last) return;
    setAttachments((prev) => {
      if (maxAttachments <= 1) return [last];
      const room = Math.max(0, maxAttachments - prev.length);
      return room === 0 ? prev : [...prev, ...sendable.slice(0, room)];
    });
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function send(preset?: string) {
    const text = (preset ?? input).trim();
    if (busy || (!text && attachments.length === 0)) return;

    const files = attachments;
    const first = files[0]?.name;
    const outgoing: AssistantMessage = {
      role: "user",
      text,
      time: nowLabel(),
      ...(files.length === 1 && first ? { fileName: first } : {}),
      ...(files.length > 1 ? { fileNames: files.map((file) => file.name) } : {}),
    };
    const next = [...messages, outgoing];
    setMessages(next);
    // A quick-start chip sends a canned prompt; keep any half-typed draft.
    if (preset === undefined) setInput("");
    setAttachments([]);
    setBusy(true);

    try {
      const images = await Promise.all(
        files.map(async (file) => {
          // A receipt photo is downscaled first so five of them still fit in
          // one request; a PDF is never re-encoded.
          const prepared =
            compressImages && file.type.startsWith("image/") ? await prepareAttachment(file) : file;
          return {
            mimeType: prepared.type || file.type || "application/pdf",
            base64: await fileToBase64(prepared),
          };
        }),
      );
      const reply = await onSubmit({
        messages: next.slice(-MAX_TURNS).map((m) => ({
          role: m.role,
          text: m.text || attachedLabel(m),
        })),
        image: images[0] ?? null,
        images,
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
      // Show what actually failed: "the AI returned an unexpected response" is
      // far more useful on screen than a generic apology.
      const message =
        e instanceof Error && e.message
          ? e.message
          : "The assistant could not reply. Please try again.";
      toast.error(message);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: message,
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
                aria-label="Close the assistant"
                title="Close the assistant"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" aria-hidden="true" />
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
            {attachments.length ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((file, index) => (
                  <span
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex max-w-full items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-[11px]"
                  >
                    <Paperclip className="size-3 shrink-0 text-regasco" aria-hidden="true" />
                    <span className="min-w-0 max-w-40 truncate">{file.name}</span>
                    <button
                      type="button"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={`Remove ${file.name}`}
                      title="Remove this file"
                      onClick={() => removeAttachment(index)}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                id="assistant-attachment-file"
                name="attachment-file"
                accept="application/pdf,image/*"
                multiple={maxAttachments > 1}
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="flex size-9 shrink-0 items-center justify-center rounded-full text-regasco transition-colors hover:bg-regasco/10 disabled:opacity-50"
                aria-label={maxAttachments > 1 ? "Attach photos or a PDF" : "Attach a photo or PDF"}
                title={attachTitle}
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus className="size-5" aria-hidden="true" />
              </button>
              <textarea
                ref={inputRef}
                rows={1}
                id="assistant-message-input"
                name="message"
                className="min-h-[3.5rem] max-h-32 flex-1 resize-none overflow-y-auto rounded-[1.25rem] border border-border bg-background px-4 py-2 text-sm leading-snug text-foreground outline-none transition placeholder:text-muted-foreground focus:border-regasco/60 focus:ring-4 focus:ring-regasco/15"
                placeholder={placeholder}
                aria-label="Message the assistant"
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  // A screenshot pasted straight into the composer is an
                  // attachment, not text, queue it like a picked file.
                  const files = Array.from(e.clipboardData.files);
                  if (files.length === 0) return;
                  e.preventDefault();
                  addFiles(files);
                }}
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
                disabled={busy || (!input.trim() && attachments.length === 0)}
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
              Edits apply to the form straight away, so check the preview before printing.
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
  const fileNames = m.fileNames?.length ? m.fileNames : m.fileName ? [m.fileName] : [];
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
          {fileNames.length ? (
            <span
              className={`mt-1 flex flex-col gap-0.5 text-[11px] ${mine ? "text-white/80" : "text-muted-foreground"}`}
            >
              {fileNames.map((name, i) => (
                <span key={`${name}-${i}`} className="flex items-center gap-1">
                  <Paperclip className="size-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{name}</span>
                </span>
              ))}
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

/** Three bouncing dots, the assistant is composing a reply. */
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
