import { getDb } from "@/server/db/client.server";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type AdminStats = {
  accounts: number;
  administrators: number;
  records: number;
  forms: number;
  recentForms: { id: string; employee_name: string; id_number: string; updated_at: string }[];
  recentRecords: { id: string; name: string; month: number; year: number; updated_at: string }[];
  /** Rows created per month over the last six months, oldest bucket first. */
  monthly: { label: string; records: number; forms: number }[];
};

async function countRows(table: "users" | "dtr_records" | "ob_forms") {
  const { count, error } = await getDb().from(table).select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** `created_at` values of one table from `sinceIso` on — only what the chart needs. */
async function createdSince(table: "dtr_records" | "ob_forms", sinceIso: string) {
  const { data, error } = await getDb()
    .from(table)
    .select("created_at")
    .gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.created_at);
}

/**
 * Zero-filled counts for the last six months (oldest first). Bucketed in UTC,
 * the same clock `created_at` is written with; months that fall in a different
 * year get a short year suffix so the axis stays unambiguous.
 */
function monthlySeries(recordDates: string[], formDates: string[]): AdminStats["monthly"] {
  const now = new Date();
  const startMonth = now.getUTCMonth() - 5; // negative rolls back into last year
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), startMonth + i, 1));
    const year = d.getUTCFullYear();
    const suffix = year === now.getUTCFullYear() ? "" : ` '${String(year).slice(2)}`;
    return {
      key: year * 12 + d.getUTCMonth(),
      label: `${MONTH_LABELS[d.getUTCMonth()] ?? ""}${suffix}`,
      records: 0,
      forms: 0,
    };
  });
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  const add = (iso: string, field: "records" | "forms") => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    const i = index.get(date.getUTCFullYear() * 12 + date.getUTCMonth());
    if (i !== undefined) {
      const bucket = buckets[i];
      if (bucket) bucket[field] += 1;
    }
  };
  recordDates.forEach((iso) => add(iso, "records"));
  formDates.forEach((iso) => add(iso, "forms"));
  return buckets.map(({ label, records, forms }) => ({ label, records, forms }));
}

/** Dashboard numbers for the admin panel: totals, the chart, latest activity. */
export async function getAdminStats(): Promise<AdminStats> {
  const db = getDb();
  const since = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 5, 1));

  const [accounts, records, forms, adminCount] = await Promise.all([
    countRows("users"),
    countRows("dtr_records"),
    countRows("ob_forms"),
    db
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .then(({ count }) => count ?? 0),
  ]);

  const [
    { data: recentForms, error: formsError },
    { data: recentRecords, error: recordsError },
    recordDates,
    formDates,
  ] = await Promise.all([
    db
      .from("ob_forms")
      .select("id,employee_name,id_number,updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    db
      .from("dtr_records")
      .select("id,name,month,year,updated_at")
      .order("updated_at", { ascending: false })
      .limit(5),
    createdSince("dtr_records", since.toISOString()),
    createdSince("ob_forms", since.toISOString()),
  ]);
  if (formsError) throw new Error(formsError.message);
  if (recordsError) throw new Error(recordsError.message);

  return {
    accounts,
    administrators: adminCount,
    records,
    forms,
    recentForms: recentForms ?? [],
    recentRecords: recentRecords ?? [],
    monthly: monthlySeries(recordDates, formDates),
  };
}
