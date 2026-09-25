import { getDb } from "@/server/db/client.server";
import type { DtrEntry, DtrHeader, Period } from "@/shared/types";

export async function listRecords() {
  const { data } = await getDb()
    .from("dtr_records")
    .select("id,name,emp_no,designation,area,month,year,period,updated_at")
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getRecord(id: string) {
  const db = getDb();
  const { data: record } = await db.from("dtr_records").select("*").eq("id", id).maybeSingle();
  if (!record) throw new Error("Record not found.");
  const { data: entries } = await db
    .from("dtr_entries")
    .select("day,time_in,time_out,schedule,remarks")
    .eq("record_id", id)
    .order("day");
  return {
    record: record as unknown as DtrHeader & { id: string },
    entries: (entries ?? []) as DtrEntry[],
  };
}

export async function createRecord(input: { month: number; year: number; period: Period }) {
  const { data: row, error } = await getDb()
    .from("dtr_records")
    .insert({ month: input.month, year: input.year, period: input.period })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}

export async function saveRecord(id: string, header: DtrHeader, entries: DtrEntry[]) {
  const db = getDb();
  const payload = {
    emp_no: header.emp_no,
    name: header.name,
    designation: header.designation,
    area: header.area,
    month: header.month,
    year: header.year,
    period: header.period,
    certified_by: header.certified_by,
    employee_signature: header.employee_signature ?? "",
    updated_at: new Date().toISOString(),
  };

  let { error } = await db.from("dtr_records").update(payload).eq("id", id);
  // Databases that haven't run migration 0003 don't have this column yet.
  if (error?.message?.includes("employee_signature")) {
    const { employee_signature: _sig, ...withoutSignature } = payload;
    ({ error } = await db.from("dtr_records").update(withoutSignature).eq("id", id));
  }
  if (error) throw new Error(error.message);

  await db.from("dtr_entries").delete().eq("record_id", id);
  if (entries.length) {
    const { error: insertError } = await db
      .from("dtr_entries")
      .insert(entries.map((entry) => ({ ...entry, record_id: id })));
    if (insertError) throw new Error(insertError.message);
  }
}

export async function deleteRecord(id: string) {
  await getDb().from("dtr_records").delete().eq("id", id);
}
