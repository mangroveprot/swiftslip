import { getDb } from "@/server/db/client.server";
import { removeStoredFile } from "@/server/services/attachments.server";
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
    // Only present when a file is attached — same shape as `getObForm`, so the
    // editor's cache writes can merge it instead of dropping it.
    ...(record.attachment_name ? { attachment: { name: record.attachment_name } } : {}),
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
    employee_signature?: string;
  },
) {
  const rowPayload = {
    owner_id: ownerId,
    month: input.month,
    year: input.year,
    period: input.period,
    emp_no: input.emp_no ?? "",
    name: input.name ?? "",
    designation: input.designation ?? "",
    area: input.area ?? "",
    employee_signature: input.employee_signature ?? "",
  };
  let { data: row, error } = await getDb()
    .from("dtr_records")
    .insert(rowPayload)
    .select("id")
    .single();
  // Databases that haven't run migration 0003 don't have this column yet.
  if (error?.message?.includes("employee_signature")) {
    const { employee_signature: _sig, ...withoutSignature } = rowPayload;
    ({ data: row, error } = await getDb()
      .from("dtr_records")
      .insert(withoutSignature)
      .select("id")
      .single());
  }
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Could not create a record.");
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
  const db = getDb();
  // Read the attachment first — deleting the row must take its file with it.
  // The subject fields ride along for the admin activity log.
  const { data: row } = await db
    .from("dtr_records")
    .select("attachment_path,name,emp_no")
    .eq("id", id)
    .eq("owner_id", ownerId)
    .maybeSingle();
  const { data, error } = await db
    .from("dtr_records")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Record not found.");
  if (row?.attachment_path) {
    // Best effort: an orphaned file is harmless, a lost record is not.
    await removeStoredFile(row.attachment_path);
  }
  return { id, name: row?.name ?? "", emp_no: row?.emp_no ?? "" };
}
