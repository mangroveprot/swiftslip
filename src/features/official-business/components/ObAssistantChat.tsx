import { chatObAssistant } from "@/api/official-business.functions";
import { AssistantChat } from "@/components/common/AssistantChat";
import { type QuickStartOption } from "@/components/common/QuickStartChips";
import type { ObEntry, ObForm } from "@/shared/types";

const GREETING =
  "Hi! Tell me what this official business is for — where you're going, when, and who approves it — and I'll fill in the form for you. You can also attach a photo or PDF of the request and I'll read it.";

/** One-click starters under the greeting, tailored to the OB form. */
const QUICK_START: QuickStartOption[] = [
  { label: "Work errand", prompt: "I need an OB for a work errand." },
  { label: "Deliver or claim documents", prompt: "I need an OB to deliver or claim documents." },
  { label: "Attach the request", attach: true },
];

/** Rotating nudges on the launcher's speech bubble, tailored to the OB form. */
const HINTS = [
  "How can I help?",
  "Tell me where you're going and I'll fill the form",
  "Attach the request and I'll read it",
];

/**
 * Floating OB assistant. The shared `AssistantChat` owns the whole widget; this
 * file only supplies the OB copy and wires the turn to the OB server function.
 */
export function ObAssistantChat({
  form,
  rows,
  onApply,
}: {
  form: ObForm;
  rows: ObEntry[];
  onApply: (patch: Partial<ObForm>, entries?: ObEntry[]) => void;
}) {
  return (
    <AssistantChat
      title="OB Assistant"
      ariaLabel="OB Assistant chat"
      storageKey="ob-assistant-open"
      greeting={GREETING}
      quickStart={QUICK_START}
      hints={HINTS}
      placeholder="Tell me what this OB is for…"
      attachTitle="Attach a photo or PDF of the request — I'll read it and fill the form"
      launcherLabel="Chat with the OB assistant"
      launcherOpenLabel="Hide the OB assistant"
      onSubmit={async ({ messages, image, today }) => {
        const reply = await chatObAssistant({
          data: { messages, form, entries: rows, today, ...(image ? { image } : {}) },
        });
        const changed = Boolean(reply.form || reply.entries);
        if (changed) onApply(reply.form ?? {}, reply.entries);
        return { reply: reply.reply, changed };
      }}
    />
  );
}
