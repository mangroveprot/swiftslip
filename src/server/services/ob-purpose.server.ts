import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";

type PurposeMode = "generate" | "enhance";

const STYLE =
  'You write the "Purpose(s)" entry on a company Official Business (OB) form. ' +
  "Your job is to turn an employee's notes into a short, clear, natural, and professional purpose.\n" +
  "Rules:\n" +
  "- Keep it brief. Prefer one short phrase or sentence.\n" +
  "- Use simple, everyday business English. Avoid unnecessarily formal or complicated words.\n" +
  "- Make it sound like something an actual employee would write, not an AI-generated statement.\n" +
  "- Be polite and professional without adding greetings, apologies, or excessive courtesy.\n" +
  "- State the actual reason for the OB directly. Do not add unnecessary explanations.\n" +
  "- Use natural wording. Avoid redundant words such as 'personally,' 'proceed to,' 'in order to,' or 'for the purpose of' unless essential.\n" +
  "- Use infinitive phrases when appropriate, such as 'To claim...', 'To submit...', or 'To attend...'.\n" +
  "- Do not force every purpose to start with 'To'. Use the most natural phrasing for the given context.\n" +
  "- Preserve all relevant details, including names, locations, and specific tasks.\n" +
  "- Do not invent details, reasons, or activities that are not provided.\n" +
  "- If multiple tasks are provided, combine them naturally using '&' or ';' when appropriate.\n" +
  "- Do not turn a simple purpose into a long explanation or a request message.\n" +
  "- Reply with ONLY the purpose text. Do not include labels, quotation marks, or explanations.\n" +
  "Examples of the expected tone and length:\n" +
  "Notes: Claim salary at RGC-Dapitan Warehouse\n" +
  "Purpose: To claim the salary at the RGC-Dapitan Warehouse.\n" +
  "Notes: Submit documents to HR\n" +
  "Purpose: To submit the required documents to HR.\n" +
  "Notes: Attend meeting with branch manager\n" +
  "Purpose: To attend a meeting with the branch manager.\n" +
  "Notes: Get approval for OB to claim salary at RGC-Dapitan Warehouse\n" +
  "Purpose: To request OB approval to claim the salary at the RGC-Dapitan Warehouse.";

function buildPrompt(mode: PurposeMode, context: string, current: string): string {
  if (mode === "enhance") {
    return (
      `${STYLE}\n\n` +
      "Task: Improve the existing purpose while keeping its original meaning. " +
      "Make only the necessary changes to improve clarity, grammar, and natural wording. " +
      "Keep all concrete details, including names, locations, and tasks. " +
      "Do not add unnecessary words, change the intended reason, or invent new information. " +
      "If the original is already clear and natural, keep it mostly unchanged.\n\n" +
      `Purpose to improve:\n${current}`
    );
  }

  return (
    `${STYLE}\n\n` +
    "Task: Write a concise OB purpose based on the notes below. " +
    "Use natural and professional wording. " +
    "Include only details explicitly provided or clearly implied. " +
    "If an existing draft is provided, use it as additional context without unnecessarily expanding it.\n\n" +
    `Notes / instructions:\n${context}` +
    (current.trim() ? `\n\nExisting draft:\n${current}` : "")
  );
}

/** Clean the model's reply into a single tidy Purpose string. */
function tidy(text: string): string {
  let out = text.trim();
  // Strip a wrapping pair of quotes the model sometimes adds.
  if (out.length >= 2 && /^["'“”]/.test(out) && /["'“”]$/.test(out)) {
    out = out.slice(1, -1).trim();
  }
  // Collapse 3+ blank lines but keep intentional line breaks.
  return out.replace(/\n{3,}/g, "\n\n");
}

/** Generate or enhance an OB "Purpose(s)" line via Gemini. */
export async function writeObPurpose(input: {
  mode: PurposeMode;
  context: string;
  current: string;
}): Promise<{ purpose: string }> {
  const { apiKey, model } = getServerConfig().gemini;
  if (!apiKey) throw new Error("AI is not configured for this app.");

  if (input.mode === "generate" && !input.context.trim()) {
    throw new Error("Add a few words of context so the AI knows what to write.");
  }
  if (input.mode === "enhance" && !input.current.trim()) {
    throw new Error("Write a rough purpose first, then let the AI enhance it.");
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

  const purpose = tidy(text);
  if (!purpose) throw new Error("The AI didn't return anything. Please try again.");
  return { purpose };
}
