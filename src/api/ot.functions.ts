import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import { logActivity } from "@/server/services/activity-log.server";
import * as attachments from "@/server/services/attachments.server";
import { chatOtAssistant as chatOtAssistantService } from "@/server/services/ot-assistant.server";
import { writeOtReason as writeOtReasonService } from "@/server/services/ot-reason.server";
import * as ot from "@/server/services/ot.server";
import * as profiles from "@/server/services/profiles.server";
import {
  attachmentPathInput,
  attachmentUploadInput,
  createOtFormInput,
  deleteRowInput,
  idInput,
  otChatInput,
  otReasonInput,
  saveOtFormInput,
} from "@/shared/schemas";

export const listOtForms = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await ot.listOtForms(user.id);
});

export const getOtForm = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await ot.getOtForm(data.id, user.id);
  });

export const createOtForm = createServerFn({ method: "POST" })
  .validator(createOtFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const profile = await profiles.getProfile(user.id);
    const created = await ot.createOtForm(user.id, {
      id_number: profile.emp_no,
      employee_name: profile.full_name,
      department: profile.area,
      position: profile.designation,
      employee_signature: profile.signature,
      date_filed: data.date_filed ?? "",
    });
    await logActivity({
      action: "ot.created",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `${profile.full_name} (${profile.emp_no})`,
      detail: `Form ${created.id}`,
    });
    return created;
  });

export const saveOtForm = createServerFn({ method: "POST" })
  .validator(saveOtFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await ot.saveOtForm(data.id, user.id, data.form, data.entries);
    return { ok: true as const };
  });

export const deleteOtForm = createServerFn({ method: "POST" })
  .validator(deleteRowInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await ot.deleteOtForm(data.id, user.id);
    // `quiet` = the app sweeping an untouched scaffold away — housekeeping,
    // not a user removing a form, so it stays out of the activity log.
    if (!data.quiet) {
      await logActivity({
        action: "ot.deleted",
        actorId: user.id,
        actorName: user.label,
        actorNumber: user.idNumber,
        target: `${removed.employee_name || user.label} (${removed.id_number || user.idNumber})`,
        detail: `Form ${removed.id}`,
      });
    }
    return { ok: true as const };
  });

/** Store the approval-slip document for one of the signed-in user's forms. */
export const uploadOtAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const stored = await attachments.uploadAttachment("ot_forms", "Form", data, user.id);
    await logActivity({
      action: "attachment.uploaded",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `OT form ${data.id}`,
      detail: stored.name,
    });
    return stored;
  });

/** Short-lived signed link to the form's attachment (`null` when there is none). */
export const getOtAttachmentUrl = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getAttachmentUrl("ot_forms", "Form", data.id, user.id);
  });

export const removeOtAttachment = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await attachments.removeAttachment("ot_forms", "Form", data.id, user.id);
    await logActivity({
      action: "attachment.removed",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `OT form ${data.id}`,
      detail: removed.name || null,
    });
    return removed;
  });

/** Store one more supporting file (medical etc.) — up to 8, 10 MB each. */
export const uploadOtOtherAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const stored = await attachments.uploadOtherAttachment(
      "ot_forms",
      "Overtime form",
      data,
      user.id,
    );
    await logActivity({
      action: "attachment.uploaded",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `OT form ${data.id}`,
      detail: stored.name,
    });
    return stored;
  });

/** Signed links for every additional file on the form, keyed by storage path. */
export const getOtOtherAttachmentUrls = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getOtherAttachmentUrls("ot_forms", "Overtime form", data.id, user.id);
  });

export const removeOtOtherAttachment = createServerFn({ method: "POST" })
  .validator(attachmentPathInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const removed = await attachments.removeOtherAttachment(
      "ot_forms",
      "Overtime form",
      data.id,
      data.path,
      user.id,
    );
    await logActivity({
      action: "attachment.removed",
      actorId: user.id,
      actorName: user.label,
      actorNumber: user.idNumber,
      target: `OT form ${data.id}`,
      detail: removed.name || null,
    });
    return removed;
  });

export const writeOtReason = createServerFn({ method: "POST" })
  .validator(otReasonInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await writeOtReasonService(data);
  });

export const chatOtAssistant = createServerFn({ method: "POST" })
  .validator(otChatInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await chatOtAssistantService(data);
  });
