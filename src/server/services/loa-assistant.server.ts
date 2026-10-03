import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";
import { loaChatReplySchema, type LoaChatInput, type LoaChatReply } from "@/shared/schemas";
import type { LoaForm } from "@/shared/types";

/**
 * System prompt for the LOA form-filling agent. It is deliberately strict about
 * the reply shape: the answer is parsed as JSON and used to patch the form, so
 * anything other than the documented object is treated as a failed request.
 */
const PROMPT =
  'You are "LOA Assistant", a chat agent built into the Leave of Absence (LOA) form of the SwiftSlip app.\n' +
  "The employee talks to you in plain language and you fill the form in for them.\n" +
  "You answer with STRICT JSON only — no prose, no markdown, no code fences:\n" +
  '{"reply":"","form":{}}\n\n' +
  'The "reply" is what the employee reads in the chat:\n' +
  "- 1 to 3 short sentences, friendly and natural, like a helpful colleague.\n" +
  "- No labels, no bullet points, no JSON, no mention of the fields you changed.\n" +
  "- If they are only saying hello, greet them back and ask why they need the leave.\n\n" +
  'The "form" is OPTIONAL — include it only when the message changes a field, and only\n' +
  "the keys you are changing. Allowed keys:\n" +
  "- id_number, employee_name, department, position (plain text)\n" +
  "- date_filed, date_from, date_to, report_back_date (YYYY-MM-DD)\n" +
  "- days_applied (plain text, but leave it alone when you change date_from / date_to —\n" +
  "  the app recalculates days and the report-back date itself)\n" +
  '- leave_type: exactly one of "Vacation Leave", "Maternity Leave", "Emergency Leave",\n' +
  '  "Sick Leave", "Paternity Leave", "Bereavement Leave", "Others", or "" to clear\n' +
  '- leave_type_other: the text on the "Others" line (only used with leave_type "Others")\n' +
  '- pay_status: exactly "with_pay", "without_pay", or "" to clear\n' +
  "- reasons (the Reasons / Remarks body)\n" +
  "- approved_by (plain text)\n" +
  "- approved_via_viber (true or false)\n" +
  "Never include employee_signature or attachment_approved — signatures are never\n" +
  "generated and approvals are confirmed with a tick, never by chat.\n" +
  "Start from the current form below and keep every value the employee did not mention.\n\n" +
  "Rules:\n" +
  "- Never invent facts. Dates, names, reasons and approvers must come from the\n" +
  "  employee or from the attached image.\n" +
  "- If something essential is still missing, ask for it in the reply instead of guessing.\n" +
  "- Resolve words like today, tomorrow and next week against today's date.\n" +
  "- If an image is attached, read it first — it is usually a medical certificate, a\n" +
  "  request slip or a memo. Fill the matching fields from it, then say in the reply\n" +
  "  what you filled in.\n" +
  "- Never output keys that are not listed above.\n";

const TRANSCRIPT_TAIL = 20;

function buildPrompt(input: LoaChatInput): string {
  const transcript = input.messages
    .slice(-TRANSCRIPT_TAIL)
    .map((m) => {
      const body = m.text.trim() || "(attachment)";
      return `${m.role === "user" ? "Employee" : "LOA Assistant"}: ${body}`;
    })
    .join("\n");

  return (
    `${PROMPT}\n` +
    (input.today ? `Today's date: ${input.today}.\n` : "") +
    `Current form:\n${JSON.stringify(input.form)}\n\n` +
    `Conversation:\n${transcript}\n\n` +
    "LOA Assistant:"
  );
}

/**
 * Runs one turn of the LOA form-filling chat through Gemini and returns the
 * validated reply: a short message plus the form changes to apply.
 */
export async function chatLoaAssistant(input: LoaChatInput): Promise<LoaChatReply> {
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

  const parsed = loaChatReplySchema.safeParse(json);
  if (!parsed.success) throw new Error("The AI returned an unexpected response. Please try again.");

  const { reply, form } = parsed.data;
  const out: LoaChatReply = { reply: reply.trim() };
  if (form) {
    // Copy through an explicit allowlist: `employee_signature` is drawn by the
    // employee and `attachment_approved` is a deliberate tick — neither can be
    // set by the model, and the reply type stays a plain `Partial<LoaForm>`.
    const patch: Partial<LoaForm> = {};
    if (form.id_number !== undefined) patch.id_number = form.id_number;
    if (form.employee_name !== undefined) patch.employee_name = form.employee_name;
    if (form.department !== undefined) patch.department = form.department;
    if (form.position !== undefined) patch.position = form.position;
    if (form.date_filed !== undefined) patch.date_filed = form.date_filed;
    if (form.date_from !== undefined) patch.date_from = form.date_from;
    if (form.date_to !== undefined) patch.date_to = form.date_to;
    if (form.days_applied !== undefined) patch.days_applied = form.days_applied;
    if (form.leave_type !== undefined) patch.leave_type = form.leave_type;
    if (form.leave_type_other !== undefined) patch.leave_type_other = form.leave_type_other;
    if (form.pay_status !== undefined) patch.pay_status = form.pay_status;
    if (form.reasons !== undefined) patch.reasons = form.reasons;
    if (form.report_back_date !== undefined) patch.report_back_date = form.report_back_date;
    if (form.approved_by !== undefined) patch.approved_by = form.approved_by;
    if (form.approved_via_viber !== undefined) patch.approved_via_viber = form.approved_via_viber;
    if (Object.keys(patch).length) out.form = patch;
  }
  if (!out.reply) out.reply = out.form ? "I've updated the form." : "";
  if (!out.reply) throw new Error("The AI didn't reply. Please try again.");
  return out;
}
