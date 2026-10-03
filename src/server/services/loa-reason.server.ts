import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";

type ReasonMode = "generate" | "enhance";

const STYLE =
  'You write the "Reasons / Remarks" entry on a company Leave of Absence (LOA) form. ' +
  "Your job is to turn an employee's notes into a short, clear, natural, and professional reason for the leave.\n" +
  "Rules:\n" +
  "- Keep it brief. One or two short sentences at most.\n" +
  "- Use simple, everyday business English. Avoid unnecessarily formal or complicated words.\n" +
  "- Make it sound like something an actual employee would write, not an AI-generated statement.\n" +
  "- Be polite and professional without adding greetings, apologies, or excessive courtesy.\n" +
  "- State the actual reason for the leave directly. Do not add unnecessary explanations.\n" +
  "- Use natural wording. Avoid redundant words such as 'personally,' 'proceed to,' 'in order to,' or 'for the purpose of' unless essential.\n" +
  "- Preserve all relevant details, including names, places, medical details and specific circumstances.\n" +
  "- Do not invent details, diagnoses, reasons or activities that are not provided.\n" +
  "- Do not turn a simple reason into a long explanation or a request message.\n" +
  "- Reply with ONLY the reason text. Do not include labels, quotation marks, or explanations.\n" +
  "Examples of the expected tone and length:\n" +
  "Notes: flu, 2 days, already saw a doctor\n" +
  "Reason: I was down with the flu for two days and was advised by my doctor to rest.\n" +
  "Notes: family emergency in Cebu, need to travel\n" +
  "Reason: Attending to a pressing family matter that requires me to travel.\n" +
  "Notes: confinement after giving birth\n" +
  "Reason: On maternity confinement following childbirth.";

function buildPrompt(mode: ReasonMode, context: string, current: string): string {
  if (mode === "enhance") {
    return (
      `${STYLE}\n\n` +
      "Task: Improve the existing reason while keeping its original meaning. " +
      "Make only the necessary changes to improve clarity, grammar, and natural wording. " +
      "Keep all concrete details, including names, places, dates and circumstances. " +
      "Do not add unnecessary words, change the intended reason, or invent new information. " +
      "If the original is already clear and natural, keep it mostly unchanged.\n\n" +
      `Reason to improve:\n${current}`
    );
  }

  return (
    `${STYLE}\n\n` +
    "Task: Write a concise reason for the leave based on the notes below. " +
    "Use natural and professional wording. " +
    "Include only details explicitly provided or clearly implied. " +
    "If an existing draft is provided, use it as additional context without unnecessarily expanding it.\n\n" +
    `Notes / instructions:\n${context}` +
    (current.trim() ? `\n\nExisting draft:\n${current}` : "")
  );
}

/** Clean the model's reply into a single tidy Reasons string. */
function tidy(text: string): string {
  let out = text.trim();
  // Strip a wrapping pair of quotes the model sometimes adds.
  if (out.length >= 2 && /^["'“”]/.test(out) && /["'“”]$/.test(out)) {
    out = out.slice(1, -1).trim();
  }
  // Collapse 3+ blank lines but keep intentional line breaks.
  return out.replace(/\n{3,}/g, "\n\n");
}

/** Generate or enhance the LOA "Reasons / Remarks" text via Gemini. */
export async function writeLoaReason(input: {
  mode: ReasonMode;
  context: string;
  current: string;
}): Promise<{ reason: string }> {
  const { apiKey, model } = getServerConfig().gemini;
  if (!apiKey) throw new Error("AI is not configured for this app.");

  if (input.mode === "generate" && !input.context.trim()) {
    throw new Error("Add a few words of context so the AI knows what to write.");
  }
  if (input.mode === "enhance" && !input.current.trim()) {
    throw new Error("Write a rough reason first, then let the AI enhance it.");
  }

  const res = await fetch(`${BIOMETRIC_IMPORT.endpoint}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(input.mode, input.context, input.current) }],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
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

  const reason = tidy(text);
  if (!reason) throw new Error("The AI didn't return anything. Please try again.");
  return { reason };
}
