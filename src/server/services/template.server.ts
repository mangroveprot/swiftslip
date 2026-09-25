import { getDb } from "@/server/db/client.server";
import type { DtrTemplate } from "@/shared/types";

export async function getTemplate(): Promise<DtrTemplate> {
  const { data } = await getDb().from("dtr_template").select("*").eq("id", 1).maybeSingle();
  return data as unknown as DtrTemplate;
}

export async function saveTemplate(template: DtrTemplate) {
  const { error } = await getDb()
    .from("dtr_template")
    .update({ ...template, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}
