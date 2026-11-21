/**
 * One place for the exported file names, so the PDF and the workbook share the
 * document's own title (`Summary_of_SR_Status_and_Updates`) and a timestamped
 * name that never overwrites yesterday's download.
 */
function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function stamp(now: Date): string {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${date}_${time}`;
}

export function buildShowroomUpdateFileName(now: Date = new Date()): string {
  return `Summary_of_SR_Status_and_Updates_${stamp(now)}.xlsx`;
}

export function buildShowroomUpdatePdfFileName(now: Date = new Date()): string {
  return `Summary_of_SR_Status_and_Updates_${stamp(now)}.pdf`;
}
