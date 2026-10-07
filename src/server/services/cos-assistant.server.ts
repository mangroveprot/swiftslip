import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";
import { cosChatReplySchema, type CosChatInput, type CosChatReply } from "@/shared/schemas";
import type { CosForm } from "@/shared/types";

/**
 * System prompt for the COS form-filling agent. It is deliberately strict about
 * the reply shape: the answer is parsed as JSON and used to patch the form, so
 * anything other than the documented object is treated as a failed request.
 */
const PROMPT =
  'You are "COS Assistant", a chat agent built into the Change of Schedule (COS) form of the SwiftSlip app.\n' +
  "The employee talks to you in plain language and you fill the form in for them.\n" +
  "You answer with STRICT JSON only — no prose, no markdown, no code fences:\n" +
  '{"reply":"","form":{},"schedules":[]}\n\n' +
  'The "reply" is what the employee reads in the chat:\n' +
  "- 1 to 3 short sentences, friendly and natural, like a helpful colleague.\n" +
  "- No labels, no bullet points, no JSON, no mention of the fields you changed.\n" +
  "- If they are only saying hello, greet them back and ask what the schedule change is for.\n\n" +
  'The "form" is OPTIONAL — include it only when the message changes a field, and only\n' +
  "the keys you are changing. Allowed keys:\n" +
  "- id_number, employee_name, plant_location, position (plain text)\n" +
  "- date_filed (YYYY-MM-DD)\n" +
  '- change_type: "shift" for Shift Schedule, "rest_day" for Rest Day\n' +
  "- reasons (the Reason/s for Change of Schedule body)\n" +
  "- approved_by, received_by, processed_by (plain text)\n" +
  "Never include employee_signature — signatures are never generated.\n" +
  "Start from the current form below and keep every value the employee did not mention.\n\n" +
  'The "schedules" is the schedule block and is OPTIONAL — include it only when it changes,\n' +
  "and then always give the complete list (never a fragment):\n" +
  '[{"idx":0,"effectivity_date":"","from_date":"","from_start":"","from_end":"",' +
  '"to_date":"","to_start":"","to_end":""}]\n' +
  '- "idx" counts from 0 upward.\n' +
  "- effectivity_date, from_date and to_date are YYYY-MM-DD.\n" +
  '- from_start / from_end and to_start / to_end are 24-hour "HH:MM" clock times.\n' +
  "- from_* describe the schedule being changed FROM, to_* the one changed TO.\n" +
  "- Leave any part empty if the employee did not give it.\n" +
  "- A change of schedule may cover more than one date — add one entry per date.\n" +
  "- Replace what they describe, drop what they say to remove, keep the rest.\n\n" +
  "Rules:\n" +
  "- Never invent facts. Dates, places, times, names and approvers must come from the\n" +
  "  employee or from the attached image.\n" +
  "- If something essential is still missing, ask for it in the reply instead of guessing.\n" +
  "- Resolve words like today, tomorrow and next week against today's date.\n" +
  "- If an image is attached, read it first — it is usually a memo, a notice, a photo of\n" +
  "  a form or a roster. Fill the matching fields from it, then say in the reply what you\n" +
  "  filled in.\n" +
  "- Never output keys that are not listed above.\n";

const TRANSCRIPT_TAIL = 20;

function buildPrompt(input: CosChatInput): string {
  const transcript = input.messages
    .slice(-TRANSCRIPT_TAIL)
    .map((m) => {
      const body = m.text.trim() || "(attachment)";
      return `${m.role === "user" ? "Employee" : "COS Assistant"}: ${body}`;
    })
    .join("\n");

  return (
    `${PROMPT}\n` +
    (input.today ? `Today's date: ${input.today}.\n` : "") +
    `Current form:\n${JSON.stringify(input.form)}\n` +
    `Current schedule:\n${JSON.stringify(input.schedules)}\n\n` +
    `Conversation:\n${transcript}\n\n` +
    "COS Assistant:"
  );
}

/**
 * Runs one turn of the COS form-filling chat through Gemini and returns the
 * validated reply: a short message plus the form/schedule changes to apply.
 */
export async function chatCosAssistant(input: CosChatInput): Promise<CosChatReply> {
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

  // responseMimeType already asks for JSON, but some models still wrap it.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The AI didn't return anything. Please try again.");

  let json: unknown;
  try {
    json = JSON.parse(match[0]);
  } catch {
    throw new Error("The AI returned an unexpected response. Please try again.");
  }

  const parsed = cosChatReplySchema.safeParse(json);
  if (!parsed.success) throw new Error("The AI returned an unexpected response. Please try again.");

  const { reply, form, schedules } = parsed.data;
  const out: CosChatReply = { reply: reply.trim() };
  if (form) {
    // Copy through an explicit allowlist: `employee_signature` is drawn by the
    // employee and must never be set by the model, and the reply type stays a
    // plain `Partial<CosForm>` all the way to the client.
    const patch: Partial<CosForm> = {};
    if (form.id_number !== undefined) patch.id_number = form.id_number;
    if (form.employee_name !== undefined) patch.employee_name = form.employee_name;
    if (form.plant_location !== undefined) patch.plant_location = form.plant_location;
    if (form.position !== undefined) patch.position = form.position;
    if (form.date_filed !== undefined) patch.date_filed = form.date_filed;
    if (form.change_type !== undefined) patch.change_type = form.change_type;
    if (form.reasons !== undefined) patch.reasons = form.reasons;
    if (form.approved_by !== undefined) patch.approved_by = form.approved_by;
    if (form.received_by !== undefined) patch.received_by = form.received_by;
    if (form.processed_by !== undefined) patch.processed_by = form.processed_by;
    if (Object.keys(patch).length) out.form = patch;
  }
  if (schedules) {
    // Drop blank rows and renumber so the table's idx-based keys stay valid.
    const filled = schedules.filter(
      (r) =>
        r.effectivity_date ||
        r.from_date ||
        r.from_start ||
        r.from_end ||
        r.to_date ||
        r.to_start ||
        r.to_end,
    );
    if (filled.length) out.schedules = filled.map((r, idx) => ({ ...r, idx }));
  }
  if (!out.reply) out.reply = out.form || out.schedules ? "I've updated the form." : "";
  if (!out.reply) throw new Error("The AI didn't reply. Please try again.");
  return out;
}
