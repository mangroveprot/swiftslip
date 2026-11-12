import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock,
  Download,
  FileDown,
  Loader2,
  Maximize2,
  Pencil,
  Printer,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ApprovedStamp } from "@/components/common/ApprovedStamp";
import { AttachmentCard } from "@/components/common/AttachmentCard";
import { FormUnavailable } from "@/components/common/FormUnavailable";
import { PreviewLightbox } from "@/components/common/PreviewLightbox";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { APP } from "@/config/app";
import { isMissingRow } from "@/lib/missing-row";
import { printSheet } from "@/lib/print";
import { pdfFileName, savePdfFrom } from "@/lib/save-pdf";
import { friendlyError, toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ObSigner } from "@swiftslip/shared/api-types";
import {
  latestObResubmit,
  obSupervisorState,
  type ObHrStatus,
  type ObResubmitChange,
} from "@swiftslip/shared/hr";
import { formatMonthDayYear } from "@swiftslip/shared/period";
import { formatTime12h, relativeTime } from "@swiftslip/shared/time";
import { ObPreview } from "@/features/official-business/components/ObPreview";
import { ObStatusCard, ObStatusLine } from "@/features/official-business/components/ObStatusCard";
import {
  obDepartureDisplay,
  obDepartureRowIndex,
  obReturnDisplay,
  obReturnRowIndex,
} from "@/features/official-business/lib/time-of-display";
import { EmployeeIdentity } from "./EmployeeProfileCard";
import { hrObAttachmentUrlQueryOptions, hrObQueryOptions, useHrActions } from "../queries";

const STEPS = [
  { key: "filed", label: "Filed" },
  { key: "approved", label: "HR approved" },
  { key: "supervisor", label: "Supervisor approved" },
  { key: "departed", label: "Departure signed" },
  { key: "completed", label: "Arrival signed" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

/**
 * One vocabulary for both steppers. The progress pills up top were green
 * while the Exit clearance rail below was ink-black; sharing the tokens makes
 * them read as a single progress story (and keeps the shades in one place).
 * Done = solid green, current = outlined dashboard green + soft halo, not-yet =
 * greyed on the light sheet and WHITE on the dark one.
 *
 * Dark mode flips --success to cream (the button fill), so a done pill would
 * render white there. It borrows dashboard-accent, the dark theme's one green
 * that keeps its hue, and --muted sinks into the near-black card, so a pending
 * step used to disappear — white fills it back in. primary-foreground is warm
 * ink on dark, which is what reads inside that white pill.
 */
const STEP_DONE_TONE =
  "border-success/40 bg-success text-success-foreground dark:border-dashboard-accent/40 dark:bg-dashboard-accent";
const STEP_CURRENT_TONE = "border-dashboard-rule bg-card text-dashboard-rule ring-dashboard-soft";
const STEP_TODO_TONE =
  "border-border bg-muted text-muted-foreground dark:border-white dark:bg-white dark:text-primary-foreground";
/** Same white as STEP_TODO_TONE without the ring: the rail marker carries no number. */
const STEP_TODO_MARKER_TONE = "border-transparent bg-muted dark:bg-white";

function stepDone(step: StepKey, status: ObHrStatus, supervisorDone: boolean): boolean {
  if (step === "filed") return status !== "draft";
  if (step === "approved")
    return (
      status === "waiting_supervisor" ||
      status === "approved" ||
      status === "departed" ||
      status === "completed"
    );
  if (step === "supervisor") return supervisorDone;
  if (step === "departed") return status === "departed" || status === "completed";
  return status === "completed";
}

/** The next run of work, so the stepper can halo one step without guessing. */
function currentStep(status: ObHrStatus, supervisorDone: boolean): StepKey | null {
  switch (status) {
    case "submitted":
      return "approved";
    // HR can already sign departure here; the supervisor only gates completion.
    case "waiting_supervisor":
      return "departed";
    case "approved":
      return "departed";
    case "departed":
      return supervisorDone ? "completed" : "supervisor";
    default:
      return null;
  }
}

function localStamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/** Arrival is stored as one timestamp, so split it for the two read-only cells. */
function signedDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function signedTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function departureLockCopy(status: ObHrStatus): string {
  switch (status) {
    case "submitted":
      return "Available once HR approves the form.";
    case "rejected":
      return "This form was rejected. It unlocks after the employee resubmits and HR approves it.";
    default:
      return "Available once the form is approved.";
  }
}

/**
 * The reviewer's working copy of an OB form: the reference's editorial detail
 * page, but wired to the real state machine. The left sheet keeps the facts and
 * the two sign-off moments; the right rail holds the decision, the supervisor's
 * slip and a scaled copy of the actual form.
 */
export function HrObDetailPage({ id }: { id: string }) {
  const { data, isError, error } = useQuery(hrObQueryOptions(id));
  const attachmentLink = useQuery({
    ...hrObAttachmentUrlQueryOptions(id),
    enabled: Boolean(data?.attachment),
  });
  const actions = useHrActions();

  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [residence, setResidence] = useState("");
  const [destination, setDestination] = useState("");

  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");

  const form = data?.form;
  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const status = form?.hr_status;
  // The first stop with a departure time and the last stop with a return time
  // own their signed date lines, matching the sign-off prefill below and the
  // printed sheet's two TIME OF columns.
  const departureRow = obDepartureRowIndex(entries);
  const returnRow = obReturnRowIndex(entries);

  // Resolved names + e-signatures for the two exit-clearance rows (the same
  // objects the printed sheet prints). They arrive via `data.signers`.
  const departureSigner = data?.signers?.departure;
  const arrivalSigner = data?.signers?.arrival;

  const itinerary = useMemo(() => {
    const from = entries.find((entry) => entry.from_place.trim())?.from_place ?? "";
    const destinations: string[] = [];
    for (const entry of entries) {
      const value = entry.to_place.trim();
      if (value && !destinations.includes(value)) destinations.push(value);
    }
    const purposes: string[] = [];
    for (const entry of entries) {
      const value = entry.purpose.trim();
      if (value && !purposes.includes(value)) purposes.push(value);
    }
    const purpose = purposes.join(" · ");
    return {
      from: from || form?.department || "",
      destinations,
      purpose: purpose && !/^to\b/i.test(purpose) ? `To ${purpose}` : purpose,
    };
  }, [entries, form?.department]);

  const returnRoute =
    itinerary.destinations.length && itinerary.from
      ? `${[...itinerary.destinations].reverse().join(" → ")} → ${itinerary.from}`
      : "";

  const initializedDefaults = useRef<string | null>(null);

  // Prefill HR's sign-off fields from the OB itself. The itinerary owns the
  // route: the first "From" is the departure residence/office and every unique
  // "To" is the destination. Arrival is the return leg, so it uses time_return
  // and shows the route reversed. Only fill blank fields once per form.
  useEffect(() => {
    if (!form || initializedDefaults.current === form.id) return;
    initializedDefaults.current = form.id;

    const tripDate = form.date_of_ob || form.date_filed || "";
    const departureEntry = entries.find((entry) => entry.time_departure.trim());
    const returnEntry = [...entries].reverse().find((entry) => entry.time_return.trim());
    const destination = itinerary.destinations.join(" → ");

    setDepartureDate(form.departure_date || tripDate);
    setDepartureTime(form.departure_time || departureEntry?.time_departure || "");
    setResidence(form.residence || itinerary.from);
    setDestination(form.destination || destination);
    setArrivalDate(tripDate);
    setArrivalTime(returnEntry?.time_return || "");
  }, [form, entries, itinerary]);

  if (isError && isMissingRow(error)) return <FormUnavailable backTo="/hr" label="the HR queue" />;
  if (!form || !status) return <DetailSkeleton />;

  const office = (data?.employee?.area ?? "").trim();
  const showOffice =
    office.length > 0 && !form.department.toLowerCase().includes(office.toLowerCase());

  const supervisor = obSupervisorState(form);
  const latestResubmit = latestObResubmit(form.resubmit_history);
  const changeMap = new Map<string, ObResubmitChange>(
    (latestResubmit?.changes ?? []).map((change) => [change.key, change]),
  );
  const supervisorDone = supervisor.state === "approved";
  const departureDone = status === "departed" || status === "completed";
  const departureCurrent = status === "approved" || status === "waiting_supervisor";
  const arrivalDone = status === "completed";
  const arrivalCurrent = status === "departed" && supervisorDone;
  const arrivalBlocked = status === "departed" && !supervisorDone;

  async function run(action: () => Promise<void>, message: string) {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      setRejecting(false);
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That action failed.");
    } finally {
      setBusy(false);
    }
  }

  const approve = () =>
    run(
      () => actions.approve({ id }),
      "Approved. The form can be signed out now; completion still needs the supervisor if it is unsigned.",
    );

  const reject = () =>
    run(
      () => actions.reject({ id, reason: reason.trim() }),
      "Rejected. The employee has been notified.",
    );

  const signDeparture = () =>
    run(
      () =>
        actions.signDeparture({
          id,
          date: departureDate,
          time: departureTime,
          residence,
          destination,
        }),
      "Departure signed.",
    );

  const signArrival = () =>
    run(
      () => actions.signArrival({ id, date: arrivalDate, time: arrivalTime }),
      "Arrival signed. This OB form is complete.",
    );

  const stampDeparture = () => {
    const stamp = localStamp();
    setDepartureDate((current) => current || stamp.date);
    setDepartureTime(stamp.time);
  };

  const stampArrival = () => {
    const stamp = localStamp();
    setArrivalDate((current) => current || stamp.date);
    setArrivalTime(stamp.time);
  };

  // The approval slip already has a signed link for this page. PDF export
  // appends it after the form, the same way the employee editor does.
  const pdfAttachments =
    data?.attachment?.name && attachmentLink.data?.url
      ? [{ name: data.attachment.name, url: attachmentLink.data.url }]
      : [];

  async function downloadWord() {
    if (!form) return;
    setExporting(true);
    const toastId = toast.loading("Preparing Word file…");
    try {
      const { downloadObWord } = await import("@/features/official-business/lib/word-export");
      await downloadObWord({
        form,
        rows: entries,
        hr: form,
        signers: data?.signers,
        fileName: `${APP.name}_OB_${form.employee_name || "form"}.docx`,
      });
      toast.success("Word file downloaded", { id: toastId });
    } catch (error) {
      toast.error(friendlyError(error, "Could not download the Word file. Please try again."), {
        id: toastId,
      });
    } finally {
      setExporting(false);
    }
  }

  const reviewDecision =
    status === "submitted" ? (
      <section>
        <h2 className="text-sm font-semibold">Review this request</h2>
        {!rejecting ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="btn h-8 bg-success text-success-foreground hover:bg-success-hover disabled:opacity-60 dark:bg-dashboard-accent dark:text-primary-foreground dark:hover:bg-dashboard-accent/80"
              disabled={busy}
              onClick={() => void approve()}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Approve
            </button>
            <button
              type="button"
              className="btn h-8 border border-destructive/70 bg-transparent text-destructive hover:bg-destructive/10"
              disabled={busy}
              onClick={() => setRejecting(true)}
            >
              Reject
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-medium">
              Why is it rejected?
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Tell the employee what needs to change."
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
                disabled={busy || reason.trim().length === 0}
                onClick={() => void reject()}
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Confirm rejection
              </button>
              <button
                type="button"
                className="btn btn-outline h-8"
                disabled={busy}
                onClick={() => setRejecting(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    ) : null;

  return (
    <main className="flex min-h-full w-full flex-col px-4 py-6 md:px-6 md:py-8 print:block print:h-auto print:overflow-visible print:p-0">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/hr"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          HR queue
        </Link>
      </div>

      <header className="no-print mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[2.15rem] font-semibold leading-none tracking-[-0.045em] sm:text-[2.75rem]">
            Official Business Form
          </h1>
          <ObStatusLine
            audience="hr"
            doc={{ ...form, employee_photo: data?.employee?.photo ?? null }}
            signers={data?.signers}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="btn btn-outline" aria-label="Export this form">
              <Download className="size-4" aria-hidden="true" />
              <span>Export</span>
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-card text-foreground">
            <DropdownMenuItem
              className="focus:bg-muted focus:text-foreground"
              disabled={exporting}
              onSelect={() =>
                void savePdfFrom(
                  "ob-sheet",
                  pdfFileName(APP.name, "OB", form.employee_name || "form"),
                  pdfAttachments,
                )
              }
            >
              <FileDown className="size-4" aria-hidden="true" />
              Save as PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              className="focus:bg-muted focus:text-foreground"
              onSelect={() => printSheet()}
            >
              <Printer className="size-4" aria-hidden="true" />
              Print
            </DropdownMenuItem>
            <DropdownMenuItem
              className="focus:bg-muted focus:text-foreground"
              disabled={exporting}
              onSelect={() => void downloadWord()}
            >
              <FileDown className="size-4" aria-hidden="true" />
              Download Word
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mt-7 grid gap-6 print:block lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <div className="no-print min-w-0 space-y-4">
          <section className="hr-card px-6 py-6 md:px-8">
            <Progress status={status} supervisorDone={supervisorDone} />

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Form details</h2>
              {latestResubmit ? (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Changed fields marked
                </span>
              ) : null}
            </div>

            {/* Photo beside the fields the form already has. Office is the one
                profile fact the sheet does not store on its own, and only when
                the department line does not already include it. */}
            <EmployeeIdentity name={form.employee_name} photo={data?.employee?.photo ?? null}>
              <ReviewField
                label="Employee name"
                value={form.employee_name}
                change={changeMap.get("employee_name")}
              />
              <ReviewField
                label="ID number"
                value={form.id_number}
                change={changeMap.get("id_number")}
              />
              <ReviewField
                label="Position"
                value={form.position}
                change={changeMap.get("position")}
              />
              <ReviewField
                label="Department / location"
                value={form.department}
                change={changeMap.get("department")}
              />
              {showOffice ? (
                <ReviewField label="Office" value={data?.employee?.area ?? ""} />
              ) : null}
            </EmployeeIdentity>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <ReviewField
                label="Date filed"
                value={formatMonthDayYear(form.date_filed) || form.date_filed}
                change={changeMap.get("date_filed")}
              />
              <ReviewField
                label="Date of OB"
                value={formatMonthDayYear(form.date_of_ob) || form.date_of_ob}
                change={changeMap.get("date_of_ob")}
              />
              <ReviewField
                label="Approved by (supervisor / dept. head)"
                value={form.approved_by}
                change={changeMap.get("approved_by")}
              />
            </div>

            <h3 className="mt-7 text-sm font-medium">Itinerary</h3>
            <div className="mt-3 space-y-5">
              {entries.map((entry, index) => {
                const departureDisplay = obDepartureDisplay(entry, {
                  hr: form,
                  isDepartureRow: index === departureRow,
                });
                const returnDisplay = obReturnDisplay(entry, {
                  hr: form,
                  isReturnRow: index === returnRow,
                  dateOfOb: form.date_of_ob,
                });
                return (
                  <div
                    key={entry.idx}
                    className={cn(index > 0 && "border-t border-border/70 pt-5")}
                  >
                    <div className="grid gap-5 sm:grid-cols-2">
                      <ReviewField
                        label="From"
                        value={entry.from_place}
                        change={changeMap.get(`entry:${entry.idx}:from_place`)}
                      />
                      <ReviewField
                        label="Destination"
                        value={entry.to_place}
                        change={changeMap.get(`entry:${entry.idx}:to_place`)}
                      />
                      <ReviewField
                        label="Purpose"
                        value={entry.purpose}
                        change={changeMap.get(`entry:${entry.idx}:purpose`)}
                      />
                      <ReviewField
                        label="Departure time"
                        value={departureDisplay.time}
                        subValue={departureDisplay.date}
                        change={changeMap.get(`entry:${entry.idx}:time_departure`)}
                      />
                      <ReviewField
                        label="Return time"
                        value={returnDisplay.time}
                        subValue={returnDisplay.date}
                        change={changeMap.get(`entry:${entry.idx}:time_return`)}
                      />
                    </div>
                  </div>
                );
              })}
              {!entries.length ? (
                <p className="text-sm text-muted-foreground">No itinerary stops.</p>
              ) : null}
            </div>
          </section>

          <section className="hr-card px-6 py-6 md:px-8">
            <h2 className="text-xl font-bold leading-tight tracking-tight">Exit clearance</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {arrivalDone
                ? "Departure and arrival are signed. This OB form is complete."
                : arrivalBlocked
                  ? "The employee is out. Completion is waiting for the supervisor's approval."
                  : departureDone
                    ? "Departure signed. Sign the arrival once the employee returns."
                    : "Next: sign the departure below, once the employee has left."}
            </p>

            <ol className="relative mt-7 space-y-7">
              <li className="relative pl-7">
                <span
                  className={cn(
                    "absolute -bottom-7 left-[8.5px] top-5 w-px",
                    departureDone
                      ? "bg-success/40 dark:bg-dashboard-accent"
                      : departureCurrent
                        ? "bg-dashboard-rule/30"
                        : "bg-border dark:bg-white",
                  )}
                  aria-hidden="true"
                />
                <StepMarker done={departureDone} current={departureCurrent} />
                <h3 className="text-sm font-semibold">Actual departure</h3>
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  {departureDone
                    ? form.departure_signed_at
                      ? `Signed ${relativeTime(form.departure_signed_at)}. The employee has left the office.`
                      : "The employee has left the office."
                    : departureCurrent
                      ? "The employee is leaving the premises."
                      : departureLockCopy(status)}
                </p>

                {departureDone ? (
                  <SignedLeg
                    fields={[
                      { label: "Date", value: formatMonthDayYear(form.departure_date) || "—" },
                      { label: "Time", value: formatTime12h(form.departure_time) || "—" },
                      { label: "Residence / office", value: form.residence || "—" },
                      { label: "Destination", value: form.destination || "—" },
                    ]}
                    signer={departureSigner}
                    stamp="Departure"
                  />
                ) : departureCurrent ? (
                  <div className="mt-4">
                    <SignOffFields
                      id="departure"
                      date={departureDate}
                      time={departureTime}
                      onDateChange={setDepartureDate}
                      onTimeChange={setDepartureTime}
                      onStamp={stampDeparture}
                    />

                    <div className="mt-4 grid gap-5 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs text-muted-foreground">Residence / office</span>
                        <input
                          type="text"
                          value={residence}
                          onChange={(event) => setResidence(event.target.value)}
                          className="hr-underlined-input mt-1"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs text-muted-foreground">Destination</span>
                        <input
                          type="text"
                          value={destination}
                          onChange={(event) => setDestination(event.target.value)}
                          className="hr-underlined-input mt-1"
                        />
                      </label>
                    </div>

                    <SignOffButton
                      label="Sign departure"
                      ready={Boolean(departureDate.trim() && departureTime.trim())}
                      busy={busy}
                      onClick={() => void signDeparture()}
                    />
                  </div>
                ) : null}
              </li>

              <li className="relative pl-7">
                <StepMarker done={arrivalDone} current={arrivalCurrent} />
                <h3 className="text-sm font-semibold">Actual arrival</h3>
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                  {arrivalDone
                    ? form.arrival_signed_at
                      ? `Signed ${relativeTime(form.arrival_signed_at)}. This OB form is complete.`
                      : "The employee has returned. This OB form is complete."
                    : arrivalCurrent
                      ? "The employee has returned. Sign them back in to close this form."
                      : status === "waiting_supervisor"
                        ? "Waiting for the employee to upload their approval attachment. Arrival unlocks once the approval slip is attached."
                        : arrivalBlocked
                          ? "Waiting for the employee to upload their approval attachment and add the supervisor's name. This form cannot be completed until then."
                          : "Waiting for the employee to return. This unlocks after the departure is signed."}
                </p>
                {returnRoute && (arrivalDone || arrivalCurrent || arrivalBlocked) ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Return route: <span className="font-medium text-foreground">{returnRoute}</span>
                  </p>
                ) : null}

                {/* Both "why arrival is blocked" notices live beside the step
                    they block, not off in the right rail. */}
                {status === "waiting_supervisor" || arrivalBlocked ? (
                  <div className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.07] p-4">
                    <h2 className="text-sm">
                      {status === "waiting_supervisor" ? (
                        <StatusBadge status="waiting_supervisor" variant="plain" />
                      ) : (
                        <StatusBadge variant="plain" tone="warning" icon={Clock}>
                          Completion blocked
                        </StatusBadge>
                      )}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {status === "waiting_supervisor"
                        ? "HR approved this form. HR can sign the departure now. The form cannot be completed until the employee uploads their approval attachment."
                        : "The employee is out on OB, but the supervisor has not approved this form. The employee must upload their approval attachment and add the supervisor's name. Only then can HR sign the arrival."}
                    </p>
                  </div>
                ) : null}

                {arrivalDone ? (
                  <SignedLeg
                    fields={[
                      {
                        label: "Date",
                        value:
                          formatMonthDayYear(form.arrival_date) ||
                          signedDate(form.arrival_signed_at),
                      },
                      {
                        label: "Time",
                        value:
                          formatTime12h(form.arrival_time) || signedTime(form.arrival_signed_at),
                      },
                    ]}
                    signer={arrivalSigner}
                    stamp="Arrival"
                  />
                ) : arrivalCurrent ? (
                  <div className="mt-4">
                    <SignOffFields
                      id="arrival"
                      date={arrivalDate}
                      time={arrivalTime}
                      onDateChange={setArrivalDate}
                      onTimeChange={setArrivalTime}
                      onStamp={stampArrival}
                    />
                    <SignOffButton
                      label="Sign arrival"
                      ready={Boolean(arrivalDate.trim() && arrivalTime.trim())}
                      busy={busy}
                      onClick={() => void signArrival()}
                    />
                  </div>
                ) : null}
              </li>
            </ol>
          </section>
        </div>

        <aside className="flex flex-col gap-4 print:gap-0 print:overflow-visible">
          <div className="no-print space-y-4">
            {reviewDecision ? <div className="hr-card p-5">{reviewDecision}</div> : null}

            {/* The one status card for the form's current state. Changed fields
                are marked on the sheet; this card only names which ones. */}
            <ObStatusCard
              audience="hr"
              doc={{ ...form, employee_photo: data?.employee?.photo ?? null }}
              signers={data?.signers}
              className="p-5"
            />
          </div>

          <div className="print:order-2">
            <AttachmentCard
              kind="ob"
              id={form.id}
              file={data?.attachment ?? null}
              canEdit={false}
              signedUrl={attachmentLink.data?.url ?? null}
              signedUrlLoading={attachmentLink.isLoading}
              stamp={supervisor.state === "approved" ? <ApprovedStamp approved size="sm" /> : null}
              cardClassName="hr-card relative shrink-0 p-5"
            />
          </div>

          <section className="flex min-h-0 flex-col gap-3 print:gap-0">
            <div className="no-print flex shrink-0 items-center justify-between gap-2">
              <p className="text-sm font-semibold">Preview</p>
              <button
                type="button"
                className="btn btn-outline size-7 p-0"
                aria-label="Open the full view"
                title="Full view: zoom in/out and drag the form around"
                onClick={() => setPreviewOpen(true)}
              >
                <Maximize2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              aria-label="Open the full Official Business form"
              className="block w-full overflow-hidden rounded-sm bg-paper text-left ring-offset-background transition-shadow hover:ring-2 hover:ring-dashboard-rule/30 print:cursor-auto print:ring-0 print:hover:ring-0"
            >
              <ObPreview
                sheetId="ob-sheet"
                form={form}
                rows={entries}
                hr={form}
                signers={data?.signers}
                employer={data?.employee?.employer}
              />
            </button>
          </section>
        </aside>
      </div>

      <PreviewLightbox
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Official Business Form — full view"
      >
        <ObPreview
          form={form}
          rows={entries}
          hr={form}
          signers={data?.signers}
          employer={data?.employee?.employer}
        />
      </PreviewLightbox>
    </main>
  );
}

function Progress({ status, supervisorDone }: { status: ObHrStatus; supervisorDone: boolean }) {
  const current = currentStep(status, supervisorDone);

  return (
    <div className="hr-stepper">
      <ol className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-0">
        {STEPS.map((step, index) => {
          const done = stepDone(step.key, status, supervisorDone);
          const isCurrent = current === step.key;
          return (
            <li key={step.key} className="flex items-center sm:flex-1 sm:last:flex-none">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                    done
                      ? STEP_DONE_TONE
                      : isCurrent
                        ? cn(STEP_CURRENT_TONE, "ring-4")
                        : STEP_TODO_TONE,
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <span aria-hidden="true">{index + 1}</span>
                  )}
                </span>
                <span
                  className={cn(
                    "min-w-0 break-words text-[11px] font-medium leading-4",
                    done
                      ? "text-foreground"
                      : isCurrent
                        ? "text-dashboard-rule"
                        : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </span>
              {index < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "mx-2 hidden h-px sm:block sm:flex-1",
                    done ? "bg-success/40 dark:bg-dashboard-accent" : "bg-border dark:bg-white",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ReviewField({
  label,
  value,
  change,
  subValue,
}: {
  label: string;
  value: string;
  change?: ObResubmitChange | undefined;
  /** Second line under the value — a TIME OF cell's signed HR date. */
  subValue?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="hr-label">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 break-words text-sm font-semibold leading-5">
        <span>{value || "—"}</span>
        {change ? (
          <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Changed
          </span>
        ) : null}
        {subValue ? (
          <span className="w-full text-xs font-medium text-muted-foreground">{subValue}</span>
        ) : null}
      </p>
      {change ? (
        <p className="mt-0.5 text-xs text-muted-foreground">Was: {change.from || "Empty"}</p>
      ) : null}
    </div>
  );
}

function ReadOnlyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="hr-label">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{value || "—"}</dd>
    </div>
  );
}

/**
 * The signed half of an Exit clearance leg, matching the owner's paper-form
 * reference: a plain read-only label/value row (no underlines, no boxes), then
 * the signer block — the saved e-signature image on top when one is on file, the
 * full printed name beneath it, and the position/designation at the bottom —
 * with the green double-outlined "Departure / Arrival signed" stamp kept close
 * beside it (the owner asked to pull the far-right stamp in) rather than pushed
 * to the card edge.
 */
function SignedLeg({
  fields,
  signer,
  stamp,
}: {
  fields: { label: string; value: string }[];
  signer?: ObSigner | undefined;
  stamp: string;
}) {
  return (
    <div className="mt-4">
      <dl
        className={cn(
          "grid grid-cols-2 gap-x-6 gap-y-4",
          fields.length >= 4 ? "sm:grid-cols-4" : "sm:grid-cols-2",
        )}
      >
        {fields.map((field) => (
          <ReadOnlyFact key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>

      <div className="mt-5 flex flex-wrap items-end gap-6">
        <div className="flex min-w-0 flex-col items-center text-center">
          {signer?.signature ? (
            <img
              src={signer.signature}
              alt={`Signature of ${signer.name}`}
              className="h-12 w-auto max-w-[220px] object-contain"
            />
          ) : null}
          <p className="mt-1 text-sm font-semibold text-foreground">{signer?.name || "—"}</p>
          <div className="mt-1 h-px w-44 bg-border" aria-hidden="true" />
          <p className="mt-1 text-xs text-muted-foreground">{signer?.position || "—"}</p>
        </div>

        <ExitClearanceStamp label={stamp} />
      </div>
    </div>
  );
}

/** Green, slightly rotated, double-outlined "Departure / Arrival signed" mark. */
function ExitClearanceStamp({ label }: { label: string }) {
  return (
    <span className="-rotate-6 shrink-0 rounded-md border-2 border-[#1f7a3f] p-[2px]">
      <span className="block rounded-[3px] border border-[#1f7a3f] px-3 py-1 text-center text-[#1f7a3f]">
        <span className="block text-[10px] font-bold uppercase tracking-[0.22em]">{label}</span>
        <span className="block text-xs font-semibold uppercase tracking-wider">signed</span>
      </span>
    </span>
  );
}

/**
 * The reference's date/time row: the two labels sit on one line and "Use
 * current time" is at the far right of the Time label, above the underlined
 * paper-form values. Departure and arrival both render through this, so the
 * two sign-off steps keep exactly the same design.
 */
function SignOffFields({
  id,
  date,
  time,
  onDateChange,
  onTimeChange,
  onStamp,
}: {
  id: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onStamp: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-5">
      <div>
        <label htmlFor={`${id}-date`} className="block text-xs text-muted-foreground">
          Date
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          onChange={(event) => onDateChange(event.target.value)}
          className="hr-underlined-input mt-1"
        />
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-time`} className="text-xs text-muted-foreground">
            Time
          </label>
          <button
            type="button"
            onClick={onStamp}
            className="whitespace-nowrap text-[11px] font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
          >
            Use current time
          </button>
        </div>
        <input
          id={`${id}-time`}
          type="time"
          value={time}
          onChange={(event) => onTimeChange(event.target.value)}
          className="hr-underlined-input mt-1"
        />
      </div>
    </div>
  );
}

/** The reference's outlined pencil button, muted until date and time are set. */
function SignOffButton({
  label,
  ready,
  busy,
  onClick,
}: {
  label: string;
  ready: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "btn mt-5 w-full gap-2 sm:w-auto",
        ready
          ? "btn-outline"
          : "cursor-not-allowed border border-transparent bg-muted text-muted-foreground",
      )}
      disabled={busy || !ready}
      onClick={onClick}
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Pencil className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}

/** Mirrors `Progress`: the same green tones, scaled down for the 18px rail. */
function StepMarker({ done, current }: { done: boolean; current: boolean }) {
  return (
    <span
      className={cn(
        "absolute left-0 top-0.5 z-10 flex size-[18px] items-center justify-center rounded-full border-2",
        done ? STEP_DONE_TONE : current ? cn(STEP_CURRENT_TONE, "ring-2") : STEP_TODO_MARKER_TONE,
      )}
      aria-hidden="true"
    >
      {done ? (
        <Check className="size-2.5" strokeWidth={3} />
      ) : current ? (
        <span className="size-2 rounded-full bg-dashboard-rule" />
      ) : null}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <main className="flex min-h-full w-full flex-col px-4 py-6 md:px-6 md:py-8">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-6 h-12 w-80 max-w-full" />
      <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Skeleton className="h-[40rem] w-full rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-52 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}
