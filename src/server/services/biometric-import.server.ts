import { BIOMETRIC_IMPORT } from "@/config/app";
import { getServerConfig } from "@/config/env.server";
import type { ImportedLog } from "@/shared/types";

type GeminiExtraction = {
  emp_no?: string;
  name?: string;
  rows: { date: string; time_in?: string; time_out?: string }[];
};

const INSTRUCTION =
  "Read this biometric time log. Return STRICT JSON only, no prose, shaped as " +
  '{"emp_no":"","name":"","rows":[{"date":"MM/DD/YYYY","time_in":"07:38 AM","time_out":"05:01 PM"}]}. ' +
  "Include every dated row, using an empty string when a punch is missing.";

/** Sends a scanned/exported biometric log to Gemini and returns the parsed rows. */
export async function importBiometricFile(file: {
  mimeType: string;
  base64: string;
}): Promise<ImportedLog> {
  const { apiKey, model } = getServerConfig().gemini;
  if (!apiKey) throw new Error("AI is not configured for this app.");

  const res = await fetch(`${BIOMETRIC_IMPORT.endpoint}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: INSTRUCTION },
            { inline_data: { mime_type: file.mimeType, data: file.base64 } },
          ],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    console.error(`Gemini API failed [${res.status}]: ${await res.text()}`);
    if (res.status === 429)
      throw new Error("Too many requests right now. Please try again in a moment.");
    if (res.status === 403)
      throw new Error("The Gemini API key is invalid or missing permissions.");
    throw new Error(`Could not read the file (${res.status}).`);
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  let text = "";
  for (const part of payload.candidates?.[0]?.content?.parts ?? []) {
    if (part.text) text += part.text;
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No time log rows were found in that file.");
  const parsed = JSON.parse(match[0]) as GeminiExtraction;

  const entries = (parsed.rows ?? [])
    .map((row) => {
      const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(row.date ?? "");
      if (!m) return null;
      return {
        month: Number(m[1]),
        day: Number(m[2]),
        year: Number(m[3]),
        time_in: (row.time_in ?? "").trim(),
        time_out: (row.time_out ?? "").trim(),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (!entries.length) throw new Error("No time log rows were found in that file.");

  return { emp_no: parsed.emp_no ?? "", name: parsed.name ?? "", entries };
}
