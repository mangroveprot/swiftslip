/** One asset joined with the names the report prints. */
export type ReportAssetSource = {
  item_id: string | null;
  floor_label: string | null;
  cubicle_seat: string | null;
  assigned_to: string | null;
  installed_flag: boolean | null;
  notes: string | null;
  type_name: string | null;
  department_name: string | null;
  status_name: string | null;
  condition_name: string | null;
  monitor_brand: string | null;
  monitor_serial: string | null;
  keyboard_brand: string | null;
  keyboard_serial: string | null;
  mouse_serial: string | null;
};
