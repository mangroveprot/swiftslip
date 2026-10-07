import { chatLoaAssistant } from "@/api/loa.functions";
import { AssistantChat } from "@/components/common/AssistantChat";
import { type QuickStartOption } from "@/components/common/QuickStartChips";
import type { LoaForm } from "@/shared/types";

const GREETING =
  "Hi! Tell me why you need the leave and the dates you'll be out — and I'll fill in the LOA form for you. You can also attach a photo or PDF of the medical certificate or request and I'll read it.";

/** One-click starters under the greeting, tailored to the LOA form. */
const QUICK_START: QuickStartOption[] = [
  { label: "Sick leave", prompt: "I need a Sick Leave." },
  { label: "Vacation leave", prompt: "I need a Vacation Leave." },
  { label: "Attach medical certificate", attach: true },
];

/** Rotating nudges on the launcher's speech bubble, tailored to the LOA form. */
const HINTS = [
  "How can I help?",
  "Tell me the reason and dates — I'll fill the LOA",
  "Attach the medical certificate and I'll read it",
];

/**
 * Floating LOA assistant. The whole widget — orange header, bubbles, composer,
 * launcher — lives in the shared `AssistantChat`; this file only supplies the
 * LOA copy and wires the turn to the LOA server function.
 */
export function LoaAssistantChat({
  form,
  onApply,
}: {
  form: LoaForm;
  onApply: (patch: Partial<LoaForm>) => void;
}) {
  return (
    <AssistantChat
      title="LOA Assistant"
      ariaLabel="LOA Assistant chat"
      storageKey="loa-assistant-open"
      greeting={GREETING}
      quickStart={QUICK_START}
      hints={HINTS}
      placeholder="Tell me what the leave is for…"
      attachTitle="Attach a photo or PDF of the certificate/request — I'll read it and fill the form"
      launcherLabel="Chat with the LOA assistant"
      launcherOpenLabel="Hide the LOA assistant"
      onSubmit={async ({ messages, image, today }) => {
        const reply = await chatLoaAssistant({
          data: { messages, form, today, ...(image ? { image } : {}) },
        });
        const changed = Boolean(reply.form);
        if (changed) onApply(reply.form ?? {});
        return { reply: reply.reply, changed };
      }}
    />
  );
}
