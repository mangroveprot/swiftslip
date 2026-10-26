/**
 * The four SwiftSlip form types, shared by the server's dashboard counts and
 * the admin chart so both use the same labels and order.
 */
export const FORM_TYPES = [
  { key: "ob", label: "Official Business", short: "OB" },
  { key: "loa", label: "Leave of Absence", short: "LOA" },
  { key: "cos", label: "Change of Schedule", short: "COS" },
  { key: "ot", label: "Overtime", short: "OT" },
] as const;

export type FormKind = (typeof FORM_TYPES)[number]["key"];

export type FormEvent = {
  type: FormKind;
  created_at: string;
};

export const FORM_TYPE_LABELS = Object.fromEntries(
  FORM_TYPES.map((type) => [type.key, type.label]),
) as Record<FormKind, string>;

export function formTypeLabel(kind: FormKind) {
  return FORM_TYPE_LABELS[kind];
}
