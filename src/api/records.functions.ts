import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import * as attachments from "@/server/services/attachments.server";
import * as profiles from "@/server/services/profiles.server";
import * as records from "@/server/services/records.server";
import {
  attachmentUploadInput,
  createRecordInput,
  idInput,
  saveRecordInput,
} from "@/shared/schemas";

export const listRecords = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await records.listRecords(user.id);
});

export const getRecord = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await records.getRecord(data.id, user.id);
  });

export const createRecord = createServerFn({ method: "POST" })
  .validator(createRecordInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const profile = await profiles.getProfile(user.id);
    return await records.createRecord(user.id, {
      ...data,
      emp_no: profile.emp_no,
      name: profile.full_name,
      designation: profile.designation,
      area: profile.area,
    });
  });

export const saveRecord = createServerFn({ method: "POST" })
  .validator(saveRecordInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await records.saveRecord(data.id, user.id, data.header, data.entries);
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await records.deleteRecord(data.id, user.id);
    return { ok: true as const };
  });

/** Store a supporting document for one of the signed-in user's records. */
export const uploadRecordAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.uploadAttachment("dtr_records", "Record", data, user.id);
  });

/** Short-lived signed link to the record's attachment (`null` when there is none). */
export const getRecordAttachmentUrl = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getAttachmentUrl("dtr_records", "Record", data.id, user.id);
  });

export const removeRecordAttachment = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.removeAttachment("dtr_records", "Record", data.id, user.id);
  });
