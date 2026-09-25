import { getDb } from "@/server/db/client.server";
import type { DtrEntry, DtrHeader, Period } from "@/shared/types";

export async function listRecords(ownerId: string) {
  const { data } = await getDb()
    .from("dtr_records")
    .select("id,name,emp_no,designation,area,month,year,period,updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false });
  return data ?? [];
}

export async function getRecord(id: string, ownerId: string) {
  const db = getDb();
  const { data: record } = await db
    .from("dtr_records")
    .select("*")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
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

export async function createRecord(
  ownerId: string,
  input: {
    month: number;
    year: number;
    period: Period;
    emp_no?: string;
    name?: string;
    designation?: string;
    area?: string;
  },
) {
  const { data: row, error } = await getDb()
    .from("dtr_records")
    .insert({
      owner_id: ownerId,
      month: input.month,
      year: input.year,
      period: input.period,
      emp_no: input.emp_no ?? "",
      name: input.name ?? "",
      designation: input.designation ?? "",
      area: input.area ?? "",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string };
}

export async function saveRecord(
  id: string,
  ownerId: string,
  header: DtrHeader,
  entries: DtrEntry[],
) {
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

  let { data: updated, error } = await db
    .from("dtr_records")
    .update(payload)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  // Databases that haven't run migration 0003 don't have this column yet.
  if (error?.message?.includes("employee_signature")) {
    const { employee_signature: _sig, ...withoutSignature } = payload;
    ({ data: updated, error } = await db
      .from("dtr_records")
      .update(withoutSignature)
      .eq("id", id)
      .eq("owner_id", ownerId)
      .select("id"));
  }
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Record not found.");

  await db.from("dtr_entries").delete().eq("record_id", id);
  if (entries.length) {
    const { error: insertError } = await db
      .from("dtr_entries")
      .insert(entries.map((entry) => ({ ...entry, record_id: id })));
    if (insertError) throw new Error(insertError.message);
  }
}

export async function deleteRecord(id: string, ownerId: string) {
  const { data, error } = await getDb()
    .from("dtr_records")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Record not found.");
}
