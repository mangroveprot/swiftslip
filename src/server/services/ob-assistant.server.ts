import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";
import { obChatReplySchema, type ObChatInput, type ObChatReply } from "@/shared/schemas";
import type { ObForm } from "@/shared/types";

/**
 * System prompt for the OB form-filling agent. It is deliberately strict about
 * the reply shape: the answer is parsed as JSON and used to patch the form, so
 * anything other than the documented object is treated as a failed request.
 */
const PROMPT =
  'You are "OB Assistant", a chat agent built into the Official Business (OB) form of the SwiftSlip app.\n' +
  "The employee talks to you in plain language and you fill the form in for them.\n" +
  "You answer with STRICT JSON only — no prose, no markdown, no code fences:\n" +
  '{"reply":"","form":{},"entries":[]}\n\n' +
  'The "reply" is what the employee reads in the chat:\n' +
  "- 1 to 3 short sentences, friendly and natural, like a helpful colleague.\n" +
  "- No labels, no bullet points, no JSON, no mention of the fields you changed.\n" +
  "- If they are only saying hello, greet them back and ask what the OB is for.\n\n" +
  'The "form" is OPTIONAL — include it only when the message changes a field, and only\n' +
  "the keys you are changing. Allowed keys:\n" +
  "- id_number, employee_name, department, position (plain text)\n" +
  "- date_filed, date_of_ob (YYYY-MM-DD)\n" +
  "- approved_by (plain text)\n" +
  "- approved_via_viber (true or false)\n" +
  "Never include employee_signature — signatures are never generated.\n" +
  "Start from the current form below and keep every value the employee did not mention.\n\n" +
  'The "entries" is the itinerary and is OPTIONAL — include it only when it changes, and\n' +
  "then always give the complete list (never a fragment):\n" +
  '[{"idx":0,"from_place":"","to_place":"","purpose":"","time_departure":"","time_return":""}]\n' +
  '- "idx" counts from 0 upward.\n' +
  '- time_departure / time_return are 24-hour "HH:MM" (07:30, 17:00), or "" when unknown.\n' +
  "- Replace what they describe, drop what they say to remove, keep the rest.\n" +
  '- purposes are short and natural, e.g. "To claim salary at the Dapitan warehouse."\n\n' +
  "Rules:\n" +
  "- Never invent facts. Dates, places, times, names and approvers must come from the\n" +
  "  employee or from the attached image.\n" +
  "- If something essential is still missing, ask for it in the reply instead of guessing.\n" +
  "- Resolve words like today, tomorrow and next week against today's date.\n" +
  "- If an image is attached, read it first — it is usually a request slip, a memo, a\n" +
  "  photo of a form or a list of stops. Fill the matching fields from it, then say in\n" +
  "  the reply what you filled in.\n" +
  "- Never output keys that are not listed above.\n";

const TRANSCRIPT_TAIL = 20;

function buildPrompt(input: ObChatInput): string {
  const transcript = input.messages
    .slice(-TRANSCRIPT_TAIL)
    .map((m) => {
      const body = m.text.trim() || "(attachment)";
      return `${m.role === "user" ? "Employee" : "OB Assistant"}: ${body}`;
    })
    .join("\n");

  return (
    `${PROMPT}\n` +
    (input.today ? `Today's date: ${input.today}.\n` : "") +
    `Current form:\n${JSON.stringify(input.form)}\n` +
    `Current itinerary:\n${JSON.stringify(input.entries)}\n\n` +
    `Conversation:\n${transcript}\n\n` +
    "OB Assistant:"
  );
}

/**
 * Runs one turn of the OB form-filling chat through Gemini and returns the
 * validated reply: a short message plus the form/itinerary changes to apply.
 */
export async function chatObAssistant(input: ObChatInput): Promise<ObChatReply> {
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

  const parsed = obChatReplySchema.safeParse(json);
  if (!parsed.success) throw new Error("The AI returned an unexpected response. Please try again.");

  const { reply, form, entries } = parsed.data;
  const out: ObChatReply = { reply: reply.trim() };
  if (form) {
    // Copy through an explicit allowlist: `employee_signature` is drawn by the
    // employee and must never be set by the model, and the reply type stays a
    // plain `Partial<ObForm>` all the way to the client.
    const patch: Partial<ObForm> = {};
    if (form.id_number !== undefined) patch.id_number = form.id_number;
    if (form.employee_name !== undefined) patch.employee_name = form.employee_name;
    if (form.department !== undefined) patch.department = form.department;
    if (form.position !== undefined) patch.position = form.position;
    if (form.date_filed !== undefined) patch.date_filed = form.date_filed;
    if (form.date_of_ob !== undefined) patch.date_of_ob = form.date_of_ob;
    if (form.approved_by !== undefined) patch.approved_by = form.approved_by;
    if (form.approved_via_viber !== undefined) patch.approved_via_viber = form.approved_via_viber;
    if (Object.keys(patch).length) out.form = patch;
  }
  if (entries) {
    // Drop blank rows and renumber so the table's idx-based keys stay valid.
    const filled = entries.filter(
      (e) => e.from_place || e.to_place || e.purpose || e.time_departure || e.time_return,
    );
    if (filled.length) out.entries = filled.map((e, idx) => ({ ...e, idx }));
  }
  if (!out.reply) out.reply = out.form || out.entries ? "I've updated the form." : "";
  if (!out.reply) throw new Error("The AI didn't reply. Please try again.");
  return out;
}
