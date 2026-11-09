import assert from "node:assert/strict";
import {
  obDepartureDisplay,
  obDepartureInputTime,
  obDepartureRowIndex,
  obDepartureText,
  obReturnDisplay,
  obReturnInputTime,
  obReturnRowIndex,
  obReturnText,
} from "./web/src/features/official-business/lib/time-of-display";
import type { ObHrFields } from "./shared/src/hr";
import type { ObEntry } from "./shared/src/types";

const row = (over: Partial<ObEntry> = {}): ObEntry => ({
  idx: 0,
  from_place: "RGC Dipolog Sat Office",
  to_place: "RGC Dipolog Sat Office",
  purpose: "fgff",
  time_departure: "",
  time_return: "",
  ...over,
});

// Owner's employee-side screenshot: both left-side time inputs are empty, but
// HR signed departure 12:26 PM / 11/07/2026 and arrival 12:55 PM / 11/07/2026.
const signed: Partial<ObHrFields> = {
  departure_signed_at: "2026-11-07T04:26:00.000Z",
  departure_date: "2026-11-07",
  departure_time: "12:26",
  arrival_signed_at: "2026-11-07T04:55:00.000Z",
  arrival_date: "2026-11-07",
  arrival_time: "12:55",
};

const departure = obDepartureDisplay(row(), { hr: signed, isDepartureRow: true });
const sameDay = obReturnDisplay(row(), {
  hr: signed,
  isReturnRow: true,
  dateOfOb: "2026-11-07",
});
const lateReturn = obReturnDisplay(row(), {
  hr: signed,
  isReturnRow: true,
  dateOfOb: "2026-11-05",
});

// DEPARTURE never prints a date, even when HR has signed it.
assert.deepEqual(departure, { time: "12:26 PM", date: "" });
assert.equal(obDepartureText(departure), "12:26 PM");
// RETURN keeps a bare time on the same day as the Date of OB …
assert.deepEqual(sameDay, { time: "12:55 PM", date: "" });
assert.equal(obReturnText(sameDay), "12:55 PM");
// … and adds the signed arrival date only on a different day.
assert.deepEqual(lateReturn, { time: "12:55 PM", date: "11/07/2026" });
assert.equal(obReturnText(lateReturn), "12:55 PM\n11/07/2026");

// Employee's planned time still wins; DEPARTURE stays bare and the RETURN date
// follows the same-day rule.
assert.deepEqual(
  obDepartureDisplay(row({ time_departure: "08:00" }), { hr: signed, isDepartureRow: true }),
  { time: "8:00 AM", date: "" },
);
assert.deepEqual(
  obReturnDisplay(row({ time_return: "17:00" }), {
    hr: signed,
    isReturnRow: true,
    dateOfOb: "2026-11-05",
  }),
  { time: "5:00 PM", date: "11/07/2026" },
);

// Only the chosen row carries the date; unsigned and non-chosen rows stay bare.
assert.deepEqual(obDepartureDisplay(row(), { hr: signed, isDepartureRow: false }), {
  time: "12:26 PM",
  date: "",
});
assert.deepEqual(
  obReturnDisplay(row(), { hr: signed, isReturnRow: false, dateOfOb: "2026-11-05" }),
  { time: "12:55 PM", date: "" },
);
assert.deepEqual(obDepartureDisplay(row(), { hr: {}, isDepartureRow: true }), {
  time: "",
  date: "",
});
assert.deepEqual(obReturnDisplay(row(), { hr: {}, isReturnRow: true, dateOfOb: "2026-11-07" }), {
  time: "",
  date: "",
});

// The employee's time inputs show HR's raw 24-hour value when they left the
// planned cell blank; unsigned legs have nothing to show.
assert.equal(obDepartureInputTime(signed), "12:26");
assert.equal(obReturnInputTime(signed), "12:55");
assert.equal(obDepartureInputTime({}), "");
assert.equal(obReturnInputTime({}), "");

// Row selection: first departure / last return, with sensible fallbacks.
const stops = [
  row({ idx: 0, time_departure: "08:00", time_return: "09:00" }),
  row({ idx: 1, time_departure: "10:00", time_return: "17:00" }),
  row({ idx: 2 }),
];
assert.equal(obDepartureRowIndex(stops), 0);
assert.equal(obReturnRowIndex(stops), 1);
assert.equal(obDepartureRowIndex([row(), row()]), 0);
assert.equal(obDepartureRowIndex([]), -1);
assert.equal(obReturnRowIndex([row(), row()]), 1);

console.log("OB time-of-display probe: all assertions passed");
