import { chatOtAssistant } from "@/api/ot.functions";
import { AssistantChat } from "@/components/common/AssistantChat";
import { type QuickStartOption } from "@/components/common/QuickStartChips";
import type { OtEntry, OtForm } from "@/shared/types";

const GREETING =
  "Hi! Tell me about the overtime — who worked it, which dates, and the shift and actual hours — and I'll fill in the form for you. You can also attach a photo or PDF of the OT request and I'll read it.";

/** One-click starters under the greeting, tailored to the OT form. */
const QUICK_START: QuickStartOption[] = [
  { label: "Worked overtime", prompt: "I worked overtime." },
  { label: "Extra shift today", prompt: "I worked an extra shift today." },
  { label: "Attach the OT request", attach: true },
];

/** Rotating nudges on the launcher's speech bubble, tailored to the OT form. */
const HINTS = [
  "How can I help?",
  "Tell me who worked OT — I'll fill the form",
  "Attach the OT request and I'll read it",
];

/**
 * Floating OT assistant. The shared `AssistantChat` owns the whole widget; this
 * file only supplies the OT copy and wires the turn to the OT server function.
 */
export function OtAssistantChat({
  form,
  entries,
  onApply,
}: {
  form: OtForm;
  entries: OtEntry[];
  onApply: (patch: Partial<OtForm>, entries?: OtEntry[]) => void;
}) {
  return (
    <AssistantChat
      title="OT Assistant"
      ariaLabel="OT Assistant chat"
      storageKey="ot-assistant-open"
      greeting={GREETING}
      quickStart={QUICK_START}
      hints={HINTS}
      placeholder="Tell me about this overtime…"
      attachTitle="Attach a photo or PDF of the request — I'll read it and fill the form"
      launcherLabel="Chat with the OT assistant"
      launcherOpenLabel="Hide the OT assistant"
      onSubmit={async ({ messages, image, today }) => {
        const reply = await chatOtAssistant({
          data: { messages, form, entries, today, ...(image ? { image } : {}) },
        });
        const changed = Boolean(reply.form || reply.entries);
        if (changed) onApply(reply.form ?? {}, reply.entries);
        return { reply: reply.reply, changed };
      }}
    />
  );
}
