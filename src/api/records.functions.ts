import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as attachments from "@/server/services/attachments.server";
import * as profiles from "@/server/services/profiles.server";
import * as records from "@/server/services/records.server";
import {
  attachmentUploadInput,
  createRecordInput,
  deleteRowInput,
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
    const created = await records.createRecord(user.id, {
      ...data,
      emp_no: profile.emp_no,
      name: profile.full_name,
      designation: profile.designation,
      area: profile.area,
    });
    await logActivity({
      action: "record.created",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `${profile.full_name} (${profile.emp_no})`,
      detail: `Record ${created.id}`,
    });
    return created;
  });

export const saveRecord = createServerFn({ method: "POST" })
  .validator(saveRecordInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await records.saveRecord(data.id, user.id, data.header, data.entries);
    return { ok: true as const };
  });

export const deleteRecord = createServerFn({ method: "POST" })
  .validator(deleteRowInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await records.deleteRecord(data.id, user.id);
    // `quiet` = the app sweeping an untouched scaffold away — housekeeping,
    // not a user removing a record, so it stays out of the activity log.
    if (!data.quiet) {
      await logActivity({
        action: "record.deleted",
        actorId: user.id,
        actorName: user.label,
        actorNumber: user.idNumber,
        target: `${removed.name || user.label} (${removed.emp_no || user.idNumber})`,
        detail: `Record ${removed.id}`,
      });
    }
    return { ok: true as const };
  });

/** Store a supporting document for one of the signed-in user's records. */
export const uploadRecordAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const stored = await attachments.uploadAttachment("dtr_records", "Record", data, user.id);
    await logActivity({
      action: "attachment.uploaded",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `Record ${data.id}`,
      detail: stored.name,
    });
    return stored;
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
    const removed = await attachments.removeAttachment("dtr_records", "Record", data.id, user.id);
    await logActivity({
      action: "attachment.removed",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `Record ${data.id}`,
      detail: removed.name || null,
    });
    return removed;
  });
