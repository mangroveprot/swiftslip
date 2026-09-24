import { createServerFn } from "@tanstack/react-start";

import type { DtrEntry, DtrHeader, DtrTemplate, Period, Role } from "./dtr-shared";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ---------------- auth (password only) ---------------- */

export const signIn = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => data)
  .handler(async ({ data }) => {
    const { appSession, hashPassword } = await import("@/features/auth/session.server");
    const db = await admin();
    const hash = hashPassword(data.password ?? "");
    const { data: row } = await db
      .from("access_codes")
      .select("role,label")
      .eq("password_hash", hash)
      .maybeSingle();
    if (!row) return { ok: false as const };
    const session = await appSession();
    await session.update({ role: row.role as Role, label: row.label });
    return { ok: true as const, role: row.role as Role, label: row.label };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { appSession } = await import("@/features/auth/session.server");
  const session = await appSession();
  await session.clear();
  return { ok: true as const };
});

export const me = createServerFn({ method: "GET" }).handler(async () => {
  const { currentRole } = await import("@/features/auth/session.server");
  return await currentRole();
});

/* ---------------- template ---------------- */

export const getTemplate = createServerFn({ method: "GET" }).handler(async () => {
  const db = await admin();
  const { data } = await db.from("dtr_template").select("*").eq("id", 1).maybeSingle();
  return data as unknown as DtrTemplate;
});

export const saveTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: DtrTemplate) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/features/auth/session.server");
    await requireAdmin();
    const db = await admin();
    const { error } = await db
      .from("dtr_template")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/* ---------------- records ---------------- */

export const listRecords = createServerFn({ method: "GET" }).handler(async () => {
  const { requireSignedIn } = await import("@/features/auth/session.server");
  await requireSignedIn();
  const db = await admin();
  const { data } = await db
    .from("dtr_records")
    .select("id,name,emp_no,designation,area,month,year,period,updated_at")
    .order("updated_at", { ascending: false });
  return data ?? [];
});

export const getRecord = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { requireSignedIn } = await import("@/features/auth/session.server");
    await requireSignedIn();
    const db = await admin();
    const { data: record } = await db
      .from("dtr_records")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!record) throw new Error("Record not found.");
    const { data: entries } = await db
      .from("dtr_entries")
      .select("day,time_in,time_out,schedule,remarks")
      .eq("record_id", data.id)
      .order("day");
    return {
      record: record as unknown as DtrHeader & { id: string },
      entries: (entries ?? []) as DtrEntry[],
    };
  });

export const createRecord = createServerFn({ method: "POST" })
  .inputValidator((data: { month: number; year: number; period: Period }) => data)
  .handler(async ({ data }) => {
    const { requireSignedIn } = await import("@/features/auth/session.server");
    await requireSignedIn();
    const db = await admin();
    const { data: row, error } = await db
      .from("dtr_records")
      .insert({ month: data.month, year: data.year, period: data.period })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const saveRecord = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; header: DtrHeader; entries: DtrEntry[] }) => data)
  .handler(async ({ data }) => {
    const { requireSignedIn } = await import("@/features/auth/session.server");
    await requireSignedIn();
    const db = await admin();
    const payload = {
      emp_no: data.header.emp_no,
      name: data.header.name,
      designation: data.header.designation,
      area: data.header.area,
      month: data.header.month,
      year: data.header.year,
      period: data.header.period,
      certified_by: data.header.certified_by,
      employee_signature: data.header.employee_signature ?? "",
      updated_at: new Date().toISOString(),
    };
    let { error } = await db.from("dtr_records").update(payload).eq("id", data.id);
    if (error?.message?.includes("employee_signature")) {
      const { employee_signature: _sig, ...withoutSig } = payload;
      ({ error } = await db.from("dtr_records").update(withoutSig).eq("id", data.id));
    }
    if (error) throw new Error(error.message);
    await db.from("dtr_entries").delete().eq("record_id", data.id);
    const rows = data.entries.map((e) => ({ ...e, record_id: data.id }));
    if (rows.length) {
      const { error: e2 } = await db.from("dtr_entries").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { requireSignedIn } = await import("@/features/auth/session.server");
    await requireSignedIn();
    const db = await admin();
    await db.from("dtr_records").delete().eq("id", data.id);
    return { ok: true as const };
  });

/* ---------------- passwords (admin only) ---------------- */

export const listCodes = createServerFn({ method: "GET" }).handler(async () => {
  const { requireAdmin } = await import("@/features/auth/session.server");
  await requireAdmin();
  const db = await admin();
  const { data } = await db
    .from("access_codes")
    .select("id,label,role,created_at")
    .order("created_at");
  return data ?? [];
});

export const upsertCode = createServerFn({ method: "POST" })
  .inputValidator((data: { id?: string; label: string; role: Role; password: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin, hashPassword } = await import("@/features/auth/session.server");
    await requireAdmin();
    if (!data.password || data.password.length < 4)
      throw new Error("Password must be at least 4 characters.");
    const db = await admin();
    const payload = {
      label: data.label,
      role: data.role,
      password_hash: hashPassword(data.password),
    };
    const { error } = data.id
      ? await db.from("access_codes").update(payload).eq("id", data.id)
      : await db.from("access_codes").insert(payload);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteCode = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { requireAdmin } = await import("@/features/auth/session.server");
    await requireAdmin();
    const db = await admin();
    const { count } = await db
      .from("access_codes")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    const { data: row } = await db
      .from("access_codes")
      .select("role")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.role === "admin" && (count ?? 0) <= 1)
      throw new Error("Keep at least one administrator password.");
    await db.from("access_codes").delete().eq("id", data.id);
    return { ok: true as const };
  });

/* ---------------- biometric file import ---------------- */

type Extracted = {
  emp_no?: string;
  name?: string;
  rows: { date: string; time_in?: string; time_out?: string }[];
};

export const importBiometricFile = createServerFn({ method: "POST" })
  .inputValidator((data: { filename: string; mimeType: string; base64: string }) => data)
  .handler(async ({ data }) => {
    const { requireSignedIn } = await import("@/features/auth/session.server");
    await requireSignedIn();

    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this app.");

    const instruction =
      "Read this biometric time log. Return STRICT JSON only, no prose, shaped as " +
      '{"emp_no":"","name":"","rows":[{"date":"MM/DD/YYYY","time_in":"07:38 AM","time_out":"05:01 PM"}]}. ' +
      "Include every dated row, using an empty string when a punch is missing.";

    const model = process.env["GEMINI_MODEL"] || "gemini-3.1-flash-lite";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: instruction },
                { inline_data: { mime_type: data.mimeType, data: data.base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Gemini API failed [${res.status}]: ${body}`);
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
    const parsed = JSON.parse(match[0]) as Extracted;

    const entries = (parsed.rows ?? [])
      .map((r) => {
        const m = /(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(r.date ?? "");
        if (!m) return null;
        return {
          month: Number(m[1]),
          day: Number(m[2]),
          year: Number(m[3]),
          time_in: (r.time_in ?? "").trim(),
          time_out: (r.time_out ?? "").trim(),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    if (!entries.length) throw new Error("No time log rows were found in that file.");

    return {
      emp_no: parsed.emp_no ?? "",
      name: parsed.name ?? "",
      entries,
    };
  });
