import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import * as attachments from "@/server/services/attachments.server";
import { chatObAssistant as chatObAssistantService } from "@/server/services/ob-assistant.server";
import * as ob from "@/server/services/official-business.server";
import { writeObPurpose as writeObPurposeService } from "@/server/services/ob-purpose.server";
import * as profiles from "@/server/services/profiles.server";
import {
  attachmentUploadInput,
  createObFormInput,
  idInput,
  obChatInput,
  obPurposeInput,
  saveObFormInput,
} from "@/shared/schemas";

export const listObForms = createServerFn({ method: "GET" }).handler(async () => {
  const user = await requireUser();
  return await ob.listObForms(user.id);
});

export const getObForm = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await ob.getObForm(data.id, user.id);
  });

export const createObForm = createServerFn({ method: "POST" })
  .validator(createObFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    const profile = await profiles.getProfile(user.id);
    return await ob.createObForm(user.id, {
      id_number: profile.emp_no,
      employee_name: profile.full_name,
      department: profile.area,
      position: profile.designation,
      date_filed: data.date_filed ?? "",
    });
  });

export const saveObForm = createServerFn({ method: "POST" })
  .validator(saveObFormInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await ob.saveObForm(data.id, user.id, data.form, data.entries);
    return { ok: true as const };
  });

export const deleteObForm = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    await ob.deleteObForm(data.id, user.id);
    return { ok: true as const };
  });

/** Store the approval-slip document for one of the signed-in user's forms. */
export const uploadObAttachment = createServerFn({ method: "POST" })
  .validator(attachmentUploadInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.uploadAttachment("ob_forms", "Form", data, user.id);
  });

/** Short-lived signed link to the form's attachment (`null` when there is none). */
export const getObAttachmentUrl = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.getAttachmentUrl("ob_forms", "Form", data.id, user.id);
  });

export const removeObAttachment = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const user = await requireUser();
    return await attachments.removeAttachment("ob_forms", "Form", data.id, user.id);
  });

export const writeObPurpose = createServerFn({ method: "POST" })
  .validator(obPurposeInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await writeObPurposeService(data);
  });

export const chatObAssistant = createServerFn({ method: "POST" })
  .validator(obChatInput)
  .handler(async ({ data }) => {
    await requireUser();
    return await chatObAssistantService(data);
  });
