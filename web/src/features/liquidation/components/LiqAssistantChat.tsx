import { chatLiqAssistant } from "@/api/liquidation.functions";
import { AssistantChat } from "@/components/common/AssistantChat";
import { type QuickStartOption } from "@/components/common/QuickStartChips";
import type { LiqExpense, LiqForm } from "@swiftslip/shared/types";

const GREETING =
  "Hi! Attach up to five receipts and I'll read them into the expense lines — or just tell me the amounts and I'll type them.";

/** One-click starters under the greeting, tailored to the LIQ form. */
const QUICK_START: QuickStartOption[] = [
  { label: "Attach receipts", attach: true },
  { label: "Read my receipts", prompt: "Read these receipts and fill in the expense lines." },
  { label: "Fuel and meals today", prompt: "I bought fuel and had meals today." },
];

/** Rotating nudges on the launcher's speech bubble, tailored to the LIQ form. */
const HINTS = [
  "How can I help?",
  "Attach receipts and I'll fill the lines",
  "Up to 5 receipts at a time",
];

/**
 * Floating Statement of Liquidation assistant. The shared `AssistantChat` owns
 * the whole widget; this file only supplies the LIQ copy and wires the turn to
 * the LIQ server function. Unlike the other forms a turn can carry several
 * receipts, so the composer is widened to five files and pictures are
 * downscaled before they are sent.
 */
export function LiqAssistantChat({
  form,
  entries,
  onApply,
}: {
  form: LiqForm;
  entries: LiqExpense[];
  onApply: (patch: Partial<LiqForm>, entries?: LiqExpense[]) => void;
}) {
  return (
    <AssistantChat
      title="LIQ Assistant"
      ariaLabel="LIQ Assistant chat"
      storageKey="liq-assistant-open"
      greeting={GREETING}
      quickStart={QUICK_START}
      hints={HINTS}
      placeholder="Tell me what you spent on this trip…"
      attachTitle="Attach up to 5 receipts and I'll read them"
      launcherLabel="Chat with the LIQ assistant"
      launcherOpenLabel="Hide the LIQ assistant"
      maxAttachments={5}
      compressImages
      onSubmit={async ({ messages, images, today }) => {
        const reply = await chatLiqAssistant({
          data: {
            messages,
            // The signature drawing is print-only; sending the data URL with
            // every turn would just be wasted bytes.
            form: { ...form, employee_signature: "" },
            entries,
            today,
            ...(images.length ? { images } : {}),
          },
        });
        const changed = Boolean(reply.form || reply.entries);
        if (changed) onApply(reply.form ?? {}, reply.entries);
        return { reply: reply.reply, changed };
      }}
    />
  );
}
