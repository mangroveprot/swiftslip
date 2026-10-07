import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";
import { otChatReplySchema, type OtChatInput, type OtChatReply } from "@/shared/schemas";
import type { OtForm } from "@/shared/types";

/**
 * System prompt for the OT form-filling agent. Deliberately strict about the
 * reply shape: the answer is parsed as JSON and used to patch the form, so
 * anything other than the documented object is treated as a failed request.
 */
const PROMPT =
  'You are "OT Assistant", a chat agent built into the Overtime (OT) form of the SwiftSlip app.\n' +
  "The employee talks to you in plain language and you fill the form in for them.\n" +
  "You answer with STRICT JSON only — no prose, no markdown, no code fences:\n" +
  '{"reply":"","form":{},"entries":[]}\n\n' +
  'The "reply" is what the employee reads in the chat:\n' +
  "- 1 to 3 short sentences, friendly and natural, like a helpful colleague.\n" +
  "- No labels, no bullet points, no JSON, no mention of the fields you changed.\n" +
  "- If they are only saying hello, greet them back and ask what the overtime was for.\n\n" +
  'The "form" is OPTIONAL — include it only when the message changes a field, and only\n' +
  "the keys you are changing. Allowed keys:\n" +
  "- id_number, employee_name, department, position (plain text)\n" +
  "- date_filed (free text — the sheet prints a date and time)\n" +
  "- reasons (the Reason for Overtime body)\n" +
  "- approved_by, received_by, processed_by (plain text)\n" +
  "Never include employee_signature — signatures are never generated.\n" +
  "Start from the current form below and keep every value the employee did not mention.\n\n" +
  'The "entries" is the OT table and is OPTIONAL — include it only when it changes, and\n' +
  "then always give the complete list (never a fragment):\n" +
  '[{"idx":0,"date_of_ot":"","regular_from":"","regular_to":"","actual_from":"",' +
  '"actual_to":"","total_hours":"","validation":""}]\n' +
  '- "idx" counts from 0 upward.\n' +
  "- date_of_ot is YYYY-MM-DD.\n" +
  "- regular_* is the REGULAR SHIFT SCHEDULE, actual_* is the ACTUAL OT HOURS. Both are\n" +
  '  24-hour "HH:MM" clock times.\n' +
  '- total_hours is what the employee says they worked, e.g. "3". Leave it empty if\n' +
  "  they did not give a total.\n" +
  '- validation is the "For HR use only" column — leave it empty unless the employee\n' +
  "  gives it.\n" +
  "- One entry per OT date. Replace what they describe, drop what they say to remove,\n" +
  "  keep the rest.\n\n" +
  "Rules:\n" +
  "- Never invent facts. Dates, times, names and approvers must come from the employee\n" +
  "  or from the attached image.\n" +
  "- If something essential is still missing, ask for it in the reply instead of guessing.\n" +
  "- Resolve words like today, tomorrow and last night against today's date.\n" +
  "- If an image is attached, read it first — it is usually a memo or a photo of a\n" +
  "  roster or a filled form. Fill the matching fields from it, then say in the reply\n" +
  "  what you filled in.\n" +
  "- Never output keys that are not listed above.\n";

const TRANSCRIPT_TAIL = 20;

function buildPrompt(input: OtChatInput): string {
  const transcript = input.messages
    .slice(-TRANSCRIPT_TAIL)
    .map((m) => {
      const body = m.text.trim() || "(attachment)";
      return `${m.role === "user" ? "Employee" : "OT Assistant"}: ${body}`;
    })
    .join("\n");

  return (
    `${PROMPT}\n` +
    (input.today ? `Today's date: ${input.today}.\n` : "") +
    `Current form:\n${JSON.stringify(input.form)}\n` +
    `Current OT entries:\n${JSON.stringify(input.entries)}\n\n` +
    `Conversation:\n${transcript}\n\n` +
    "OT Assistant:"
  );
}

/** Runs one turn of the OT form-filling chat through Gemini. */
export async function chatOtAssistant(input: OtChatInput): Promise<OtChatReply> {
  const { apiKey, model } = getServerConfig().gemini;
  if (!apiKey) throw new Error("AI is not configured for this app.");

  const parts: ({ text: string } | { inline_data: { mime_type: string; data: string } })[] = [
    { text: buildPrompt(input) },
  ];
  if (input.image) {
    parts.push({
      inline_data: { mime_type: input.image.mimeType, data: input.image.base64 },
    });
  }

  const res = await fetch(`${BIOMETRIC_IMPORT.endpoint}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2048,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    console.error(`Gemini API failed [${res.status}]: ${await res.text()}`);
    if (res.status === 429)
      throw new Error("Too many requests right now. Please try again in a moment.");
    if (res.status === 403)
      throw new Error("The Gemini API key is invalid or missing permissions.");
    throw new Error(`The AI request failed (${res.status}).`);
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  let text = "";
  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    if (part.text) text += part.text;
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI didn't return anything. Please try again.");

  let json: unknown;
  try {
    json = JSON.parse(match[0]);
  } catch {
    throw new Error("The AI returned an unexpected response. Please try again.");
  }

  const parsed = otChatReplySchema.safeParse(json);
  if (!parsed.success) throw new Error("The AI returned an unexpected response. Please try again.");

  const { reply, form, entries } = parsed.data;
  const out: OtChatReply = { reply: reply.trim() };
  if (form) {
    // Copy through an explicit allowlist: `employee_signature` is drawn by the
    // employee and must never be set by the model.
    const patch: Partial<OtForm> = {};
    if (form.id_number !== undefined) patch.id_number = form.id_number;
    if (form.employee_name !== undefined) patch.employee_name = form.employee_name;
    if (form.department !== undefined) patch.department = form.department;
    if (form.position !== undefined) patch.position = form.position;
    if (form.date_filed !== undefined) patch.date_filed = form.date_filed;
    if (form.reasons !== undefined) patch.reasons = form.reasons;
    if (form.approved_by !== undefined) patch.approved_by = form.approved_by;
    if (form.received_by !== undefined) patch.received_by = form.received_by;
    if (form.processed_by !== undefined) patch.processed_by = form.processed_by;
    if (Object.keys(patch).length) out.form = patch;
  }
  if (entries) {
    // Drop blank rows and renumber so the table's idx-based keys stay valid.
    const filled = entries.filter(
      (r) =>
        r.date_of_ot ||
        r.regular_from ||
        r.regular_to ||
        r.actual_from ||
        r.actual_to ||
        r.total_hours ||
        r.validation,
    );
    if (filled.length) out.entries = filled.map((r, idx) => ({ ...r, idx }));
  }
  if (!out.reply) out.reply = out.form || out.entries ? "I've updated the form." : "";
  if (!out.reply) throw new Error("The AI didn't reply. Please try again.");
  return out;
}
