/* TEMP harness: run the real browser-only DTR Word export under Node and write
 * the .docx to disk so Word can be asked for a real page count.
 *
 *   npx tsx scripts/_dtr_export.mts [outpath]
 */
import fs from "node:fs";

const SIG = fs.readFileSync("scripts/_dtr_sig.png").toString("base64");
/** `--no-sig` exercises the empty-signature path. */
const NOSIG = process.argv.includes("--no-sig");

globalThis.fetch = (async (url: string) => {
  const buf = fs.readFileSync(String(url).replace(/^\//, "public/"));
  return {
    ok: true,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}) as unknown as typeof fetch;

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 600;
  naturalHeight = 200;
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0);
  }
}
(globalThis as any).Image = FakeImage;

let captured: any = null;
(globalThis as any).document = {
  createElement: () => ({ set href(_v: string) {}, click() {}, remove() {} }),
  body: { appendChild() {} },
};
(URL as any).createObjectURL = (blob: any) => {
  captured = blob;
  return "blob:fake";
};
(URL as any).revokeObjectURL = () => {};

const { downloadDtrWord } = await import("../src/features/records/lib/word-export");

const MONTH = 6;
const YEAR = 2026;
const days = Array.from({ length: 15 }, (_, i) => i + 1);

await downloadDtrWord({
  template: {
    title: "DAILY TIME RECORD",
    columns: { in: "IN", out: "OUT", schedule: "Working Schedule", remarks: "REMARKS" },
    employee_signature_label: "Employee's Signature Over Printed Name",
    certified_by_label: "Certified by:",
    certifier_signature_label: "Signature Over Printed Name / Position",
  } as any,
  header: {
    emp_no: "5056",
    name: "GERALD VILLAVER",
    designation: "IT SUPPORT",
    area: "RGC-DIPOLOG SAT OFFICE",
    period: "first_half",
    month: MONTH,
    year: YEAR,
    certified_by: "RON A. MALDIA",
    employee_signature: NOSIG ? "" : `data:image/png;base64,${SIG}`,
  } as any,
  days,
  entryFor: (d: number) =>
    ({
      time_in: "8:00 AM",
      time_out: "5:00 PM",
      schedule: "8:00 AM - 5:00 PM",
      remarks: d === 3 ? "REST DAY" : "",
    }) as any,
  fileName: "DTR_test",
});

const out = process.argv[2] ?? "scripts/_dtr_out2.docx";
const buf = Buffer.from(await captured.arrayBuffer());
fs.writeFileSync(out, buf);
console.log(`wrote ${out} (${buf.length} bytes)`);
