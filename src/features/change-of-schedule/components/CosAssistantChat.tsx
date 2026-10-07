import { chatCosAssistant } from "@/api/cos.functions";
import { AssistantChat } from "@/components/common/AssistantChat";
import { type QuickStartOption } from "@/components/common/QuickStartChips";
import type { CosForm, CosSchedule } from "@/shared/types";

const GREETING =
  "Hi! Tell me about the schedule change — who it's for, which dates, the new hours and who approves it — and I'll fill in the form for you. You can also attach a photo or PDF of the notice and I'll read it.";

/** One-click starters under the greeting, tailored to the COS form. */
const QUICK_START: QuickStartOption[] = [
  { label: "Change my shift", prompt: "I need to change my shift schedule." },
  { label: "Change my rest day", prompt: "I need to change my rest day." },
  { label: "Attach the notice", attach: true },
];

/** Rotating nudges on the launcher's speech bubble, tailored to the COS form. */
const HINTS = [
  "How can I help?",
  "Tell me the new schedule — I'll fill the form",
  "Attach the notice and I'll read it",
];

/**
 * Floating Change of Schedule assistant. The shared `AssistantChat` owns the
 * whole widget; this file only supplies the COS copy and wires the turn to the
 * COS server function.
 */
export function CosAssistantChat({
  form,
  schedules,
  onApply,
}: {
  form: CosForm;
  schedules: CosSchedule[];
  onApply: (patch: Partial<CosForm>, schedules?: CosSchedule[]) => void;
}) {
  return (
    <AssistantChat
      title="COS Assistant"
      ariaLabel="COS Assistant chat"
      storageKey="cos-assistant-open"
      greeting={GREETING}
      quickStart={QUICK_START}
      hints={HINTS}
      placeholder="Tell me about the schedule change…"
      attachTitle="Attach a photo or PDF of the notice — I'll read it and fill the form"
      launcherLabel="Chat with the COS assistant"
      launcherOpenLabel="Hide the COS assistant"
      onSubmit={async ({ messages, image, today }) => {
        const reply = await chatCosAssistant({
          data: { messages, form, schedules, today, ...(image ? { image } : {}) },
        });
        const changed = Boolean(reply.form || reply.schedules);
        if (changed) onApply(reply.form ?? {}, reply.schedules);
        return { reply: reply.reply, changed };
      }}
    />
  );
}
