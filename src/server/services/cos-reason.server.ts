import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";

type ReasonMode = "generate" | "enhance";

const STYLE =
  'You write the "Reason/s for Change of Schedule" entry on a company Change of Schedule (COS) form. ' +
  "Your job is to turn an employee's notes into a short, clear, natural, and professional reason.\n" +
  "Rules:\n" +
  "- Keep it brief. Prefer one short phrase or sentence.\n" +
  "- Use simple, everyday business English. Avoid unnecessarily formal or complicated words.\n" +
  "- Make it sound like something an actual employee would write, not an AI-generated statement.\n" +
  "- Be polite and professional without adding greetings, apologies, or excessive courtesy.\n" +
  "- State the actual reason for the schedule change directly. Do not add unnecessary explanations.\n" +
  "- Use natural wording. Avoid redundant words such as 'personally,' 'proceed to,' 'in order to,' or 'for the purpose of' unless essential.\n" +
  "- Use infinitive phrases when appropriate, such as 'To attend...', 'To cover...', or 'To adjust...'.\n" +
  "- Do not force every reason to start with 'To'. Use the most natural phrasing for the given context.\n" +
  "- Preserve all relevant details, including dates, locations, and specific tasks.\n" +
  "- Do not invent details, reasons, or activities that are not provided.\n" +
  "- If multiple points are provided, combine them naturally using '&' or ';' when appropriate.\n" +
  "- Do not turn a simple reason into a long explanation or a request message.\n" +
  "- Reply with ONLY the reason text. Do not include labels, quotation marks, or explanations.\n" +
  "Examples of the expected tone and length:\n" +
  "Notes: holiday on Oct 7 in Dipolog City\n" +
  "Reason: October 7, 2026, is a special non-working holiday in Dipolog City.\n" +
  "Notes: covering for a teammate on leave\n" +
  "Reason: To cover for a teammate who is on leave.\n" +
  "Notes: shifting my rest day because of a branch audit\n" +
  "Reason: To move my rest day for the branch audit.";

function buildPrompt(mode: ReasonMode, context: string, current: string): string {
  if (mode === "enhance") {
    return (
      `${STYLE}\n\n` +
      "Task: Improve the existing reason while keeping its original meaning. " +
      "Make only the necessary changes to improve clarity, grammar, and natural wording. " +
      "Keep all concrete details, including dates, locations, and tasks. " +
      "Do not add unnecessary words, change the intended reason, or invent new information. " +
      "If the original is already clear and natural, keep it mostly unchanged.\n\n" +
      `Reason to improve:\n${current}`
    );
  }

  return (
    `${STYLE}\n\n` +
    "Task: Write a concise reason based on the notes below. " +
    "Use natural and professional wording. " +
    "Include only details explicitly provided or clearly implied. " +
    "If an existing draft is provided, use it as additional context without unnecessarily expanding it.\n\n" +
    `Notes / instructions:\n${context}` +
    (current.trim() ? `\n\nExisting draft:\n${current}` : "")
  );
}

/** Clean the model's reply into a single tidy reason string. */
function tidy(text: string): string {
  let out = text.trim();
  // Strip a wrapping pair of quotes the model sometimes adds.
  if (out.length >= 2 && /^["'“”]/.test(out) && /["'“”]$/.test(out)) {
    out = out.slice(1, -1).trim();
  }
  // Collapse 3+ blank lines but keep intentional line breaks.
  return out.replace(/\n{3,}/g, "\n\n");
}

/** Generate or enhance a COS "Reason/s for Change of Schedule" line via Gemini. */
export async function writeCosReason(input: {
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
