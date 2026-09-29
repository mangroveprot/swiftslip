import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";

type PurposeMode = "generate" | "enhance";

// Shared voice for both modes: the "Purpose(s)" line on a company Official
// Business form — short, plain, professional. The example anchors the length and
// tone we want (fragments joined with "&"/";", no labels or fluff).
const STYLE =
  'You write the "Purpose(s)" entry on a company Official Business (OB) form — the ' +
  "short reason an employee is leaving the office for work.\n" +
  "Rules:\n" +
  "- Keep it SHORT: a brief phrase or one to two short sentences, never a paragraph.\n" +
  "- Plain, direct business language. No greetings, labels, quotes, or filler.\n" +
  "- You may join multiple tasks with '&' or ';'.\n" +
  "- Reply with ONLY the purpose text, nothing else.\n" +
  'Example of the right length and tone: "CCTV Installation for Jose Dalman & also ' +
  "had the showroom branch heads sign acknowledgment forms for the last cctv " +
  'installations;"';

function buildPrompt(mode: PurposeMode, context: string, current: string): string {
  if (mode === "enhance") {
    return (
      `${STYLE}\n\n` +
      "Task: Rewrite the following purpose so it is clear, concise, and professional. " +
      "Keep the same meaning and every concrete detail (names, places, tasks). Do not invent new facts.\n\n" +
      `Purpose to improve:\n${current}`
    );
  }
  return (
    `${STYLE}\n\n` +
    "Task: Write the purpose from the notes below. Use only what the notes imply; " +
    "do not invent specific names or places that aren't given.\n\n" +
    `Notes / instructions:\n${context}` +
    (current.trim() ? `\n\nExisting draft to build on:\n${current}` : "")
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
