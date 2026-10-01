import { createServerFn } from "@tanstack/react-start";

import { requireUser } from "@/server/auth/session.server";
import * as ob from "@/server/services/official-business.server";
import { chatObAssistant as chatObAssistantService } from "@/server/services/ob-assistant.server";
import { writeObPurpose as writeObPurposeService } from "@/server/services/ob-purpose.server";
import * as profiles from "@/server/services/profiles.server";
import {
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
