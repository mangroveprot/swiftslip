import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import * as records from "@/server/services/records.server";
import { createRecordInput, idInput, saveRecordInput } from "@/shared/schemas";

export const listRecords = createServerFn({ method: "GET" }).handler(async () => {
  await requireUser();
  return await records.listRecords();
});

export const getRecord = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await records.getRecord(data.id);
  });

export const createRecord = createServerFn({ method: "POST" })
  .validator(createRecordInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await records.createRecord(data);
  });

export const saveRecord = createServerFn({ method: "POST" })
  .validator(saveRecordInput)
  .handler(async ({ data }) => {
    await requireUser();
    await records.saveRecord(data.id, data.header, data.entries);
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    await requireUser();
    await records.deleteRecord(data.id);
    return { ok: true as const };
  });
