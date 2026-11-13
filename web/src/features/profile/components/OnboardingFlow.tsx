import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

import { saveMyPhoto, saveMyProfile } from "@/api/profile.functions";
import { OrgSelect } from "@/components/common/OrgSelect";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { orgOptionsQueryOptions } from "@/features/admin/queries";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTO_MB,
  PHOTO_ACCEPT,
  readPhotoFile,
  type PhotoSource,
} from "@/lib/photo";
import { normalizeSignature } from "@/lib/signature";
import { toast } from "@/lib/toast";
import {
  departmentForPosition,
  normalizeDesignation,
  normalizePosition,
  positionsUnder,
} from "@swiftslip/shared/org";
import type { EmployeeProfile, SessionUser } from "@swiftslip/shared/types";
import {
  clearOnboardingStep,
  markOnboardingSeen,
  profileGaps,
  readOnboardingStep,
  writeOnboardingStep,
  type OnboardingStep,
} from "../onboarding";
import { profileQueryOptions } from "../queries";
import { PhotoCropDialog } from "./PhotoCropDialog";

const empty: EmployeeProfile = {
  emp_no: "",
  full_name: "",
  designation: "",
  area: "",
  department: "",
  employer: 1,
  signature: "",
  photo: "",
  supervisor: "",
};

/**
 * Welcome for an unfinished profile. Three steps, each skippable. Leaving it,
 * Finish or Skip through to the end, hands off to the app chooser, which shows
 * the picker when several apps are granted or opens the only one straight away.
 * Nothing here blocks the app; whatever was left blank stays as a reminder
 * until My account is filled, and the next sign-in offers the welcome again.
 */
export function OnboardingFlow({ session }: { session: SessionUser }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data } = useQuery(profileQueryOptions());
  const { data: orgLists } = useQuery(orgOptionsQueryOptions());
  const [form, setForm] = useState<EmployeeProfile>(empty);
  const [step, setStep] = useState<OnboardingStep>(() => {
    // A refresh keeps the exact step; a new sign-in cleared it (see
    // resetOnboardingSession). Starting over, open on the first part still
    // missing, a returning user may already have a name or work details and
    // should not be asked to type them again.
    const remembered = readOnboardingStep(session.id);
    if (remembered) return remembered;
    const gaps = profileGaps(data);
    if (!gaps.name && gaps.work) return 2;
    if (!gaps.name && !gaps.work && gaps.signature) return 3;
    return 1;
  });
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [deptInvalid, setDeptInvalid] = useState(false);
  const [departmentInvalid, setDepartmentInvalid] = useState(false);
  const [positionInvalid, setPositionInvalid] = useState(false);
  const [cropSource, setCropSource] = useState<PhotoSource | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Steps this visit already saved. Skip leaves those alone and only throws
  // away text that was never written.
  const wrote = useRef({ name: false, work: false, signature: false });

  useEffect(() => {
    writeOnboardingStep(session.id, step);
  }, [session.id, step]);

  useEffect(() => {
    if (!data || loaded) return;
    setForm({ ...data, emp_no: data.emp_no || session.idNumber });
    setLoaded(true);
  }, [data, loaded, session.idNumber]);

  const keyNo = session.idNumber || session.label;
  const designationOptions = orgLists?.designations ?? [];
  const baseDepartments = orgLists?.departments ?? [];
  const impliedDepartment = departmentForPosition(form.designation, orgLists);
  const departmentOptions =
    impliedDepartment && !baseDepartments.includes(impliedDepartment)
      ? [...baseDepartments, impliedDepartment]
      : baseDepartments;

  async function persist(next: EmployeeProfile): Promise<EmployeeProfile | null> {
    setBusy(true);
    try {
      const saved = await saveMyProfile({
        data: { ...next, emp_no: next.emp_no || session.idNumber },
      });
      setForm(saved);
      await qc.invalidateQueries({ queryKey: profileQueryOptions().queryKey });
      return saved;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That could not be saved.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function onPickPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error(`That photo is over ${MAX_PHOTO_MB} MB. Pick a smaller one.`);
      return;
    }
    const source = await readPhotoFile(file);
    if (!source) {
      toast.error("That file couldn't be read as an image.");
      return;
    }
    setCropSource(source);
    setCropOpen(true);
  }

  async function applyPhoto(photo: string) {
    setCropOpen(false);
    setCropSource(null);
    const previous = form.photo;
    setForm((current) => ({ ...current, photo }));
    setBusy(true);
    try {
      const saved = await saveMyPhoto({ data: { photo } });
      setForm((current) => ({ ...current, photo: saved.photo }));
      await qc.invalidateQueries({ queryKey: profileQueryOptions().queryKey });
      await qc.invalidateQueries({ queryKey: ["user-photos"] });
    } catch (e) {
      setForm((current) => ({ ...current, photo: previous }));
      toast.error(e instanceof Error ? e.message : "That photo could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function continueName() {
    const full_name = form.full_name.trim();
    if (!full_name) return;
    const saved = await persist({ ...form, full_name });
    if (!saved) return;
    wrote.current.name = true;
    setStep(2);
  }

  function skipName() {
    if (!wrote.current.name) {
      setForm((current) => ({ ...current, full_name: data?.full_name ?? "" }));
    }
    setStep(2);
  }

  async function continueWork() {
    if (deptInvalid) {
      toast.error("Please specify the designation, or pick one from the list.");
      return;
    }
    if (departmentInvalid) {
      toast.error("Please specify the department, or pick one from the list.");
      return;
    }
    if (positionInvalid) {
      toast.error("Please specify the position, or pick one from the list.");
      return;
    }
    const saved = await persist(form);
    if (!saved) return;
    wrote.current.work = true;
    setStep(3);
  }

  function skipWork() {
    if (!wrote.current.work) {
      setForm((current) => ({
        ...current,
        supervisor: data?.supervisor ?? "",
        area: data?.area ?? "",
        department: data?.department ?? "",
        designation: data?.designation ?? "",
      }));
    }
    setStep(3);
  }

  async function finishSignature(signature: string) {
    const tidy = signature ? await normalizeSignature(signature) : "";
    const saved = await persist({ ...form, signature: tidy });
    if (!saved) return;
    wrote.current.signature = Boolean(tidy);
    setStep("done");
  }

  function skipSignature() {
    if (!wrote.current.signature) {
      setForm((current) => ({ ...current, signature: data?.signature ?? "" }));
    }
    setStep("done");
  }

  /**
   * Leaving the welcome goes back through /choose, not straight to /records.
   * That guard is the single source of truth for where a signed-in user lands:
   * it opens the picker when two or more apps are granted and redirects straight
   * into the app when only one is. Marking the welcome "seen" first is what stops
   * /choose from sending us back here.
   */
  async function enterApp() {
    clearOnboardingStep(session.id);
    markOnboardingSeen(session.id);
    await navigate({ to: "/choose" });
  }

  const gaps = profileGaps(form);
  const given = givenName(form.full_name, keyNo);

  return (
    <main className="relative flex min-h-dvh items-center justify-center px-4 py-10">
      <ThemeToggle className="absolute top-4 right-4 sm:top-6 sm:right-6" />

      <div className="w-full max-w-md">
        {step === "done" ? (
          <DoneCard
            given={given}
            form={form}
            gaps={gaps}
            busy={busy}
            onFinishName={() => setStep(1)}
            onFinishWork={() => setStep(2)}
            onFinishSignature={() => setStep(3)}
            onEnter={() => void enterApp()}
          />
        ) : (
          <section className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7">
            <StepBar step={step} />
            {step === 1 ? (
              <NameStep
                form={form}
                keyNo={keyNo}
                busy={busy || !loaded}
                fileRef={fileRef}
                onPick={(file) => void onPickPhoto(file)}
                onName={(full_name) => setForm((current) => ({ ...current, full_name }))}
                onContinue={() => void continueName()}
                onSkip={skipName}
              />
            ) : null}
            {step === 2 ? (
              <WorkStep
                form={form}
                busy={busy || !loaded}
                allowOthers={session.role === "admin"}
                designationOptions={designationOptions}
                departmentOptions={departmentOptions}
                positions={positionsUnder(form.department, orgLists)}
                onSupervisor={(supervisor) => setForm((current) => ({ ...current, supervisor }))}
                onDesignation={(area) =>
                  setForm((current) => ({ ...current, area: normalizeDesignation(area) }))
                }
                onDepartment={(department) => setForm((current) => ({ ...current, department }))}
                onPosition={(value) =>
                  setForm((current) => {
                    const next: EmployeeProfile = {
                      ...current,
                      designation: normalizePosition(value),
                    };
                    const implied = departmentForPosition(value, orgLists);
                    const held = current.department.trim();
                    if (implied && !positionsUnder(held, orgLists).includes(next.designation)) {
                      next.department = implied;
                    }
                    return next;
                  })
                }
                onDeptInvalid={setDeptInvalid}
                onDepartmentInvalid={setDepartmentInvalid}
                onPositionInvalid={setPositionInvalid}
                onBack={() => setStep(1)}
                onContinue={() => void continueWork()}
                onSkip={skipWork}
              />
            ) : null}
            {step === 3 ? (
              <SignatureStep
                initial={form.signature}
                busy={busy || !loaded}
                onBack={() => setStep(2)}
                onFinish={(signature) => void finishSignature(signature)}
                onSkip={skipSignature}
              />
            ) : null}
          </section>
        )}
        {step === "done" ? null : (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            You can finish this any time in My account.
          </p>
        )}
      </div>

      <PhotoCropDialog
        open={cropOpen}
        source={cropSource}
        onCancel={() => {
          setCropOpen(false);
          setCropSource(null);
        }}
        onUse={(dataUrl) => void applyPhoto(dataUrl)}
      />
    </main>
  );
}

function givenName(fullName: string, fallback: string) {
  const first = fullName.trim().split(/\s+/)[0];
  return first || fallback;
}

function StepBar({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full ${n <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">Step {step} of 3</p>
    </div>
  );
}

function NameStep({
  form,
  keyNo,
  busy,
  fileRef,
  onPick,
  onName,
  onContinue,
  onSkip,
}: {
  form: EmployeeProfile;
  keyNo: string;
  busy: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onPick: (file: File | undefined) => void;
  onName: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const named = form.full_name.trim().length > 0;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (named && !busy) onContinue();
      }}
    >
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        What should we call you?
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        This name appears on your forms and in the HR system.
      </p>

      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="mt-5 flex items-center gap-3 rounded-lg border border-dashed border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
      >
        {form.photo ? (
          <ProfileAvatar photo={form.photo} name={form.full_name || keyNo} size={36} />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ImagePlus className="size-4" aria-hidden="true" />
          </span>
        )}
        {form.photo ? "Change photo" : "Add a photo"}
      </button>
      <input
        ref={fileRef}
        type="file"
        id="profile-onboarding-photo"
        name="photo"
        accept={PHOTO_ACCEPT}
        className="hidden"
        onChange={(event) => {
          onPick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <label className="mt-4 block">
        <span className="lbl">Key No.</span>
        <input
          className="inp bg-muted text-muted-foreground"
          id="profile-onboarding-key-no"
          name="key-no"
          value={keyNo}
          disabled
          readOnly
        />
      </label>
      <label className="mt-3 block">
        <span className="lbl">Full name</span>
        <input
          className="inp"
          id="profile-onboarding-full-name"
          name="full-name"
          value={form.full_name}
          placeholder="Your full name"
          autoFocus
          disabled={busy}
          onChange={(event) => onName(event.target.value)}
        />
      </label>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onSkip}
          disabled={busy}
        >
          Skip for now
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !named}>
          Continue
        </button>
      </div>
    </form>
  );
}

function WorkStep({
  form,
  busy,
  allowOthers,
  designationOptions,
  departmentOptions,
  positions,
  onSupervisor,
  onDesignation,
  onDepartment,
  onPosition,
  onDeptInvalid,
  onDepartmentInvalid,
  onPositionInvalid,
  onBack,
  onContinue,
  onSkip,
}: {
  form: EmployeeProfile;
  busy: boolean;
  allowOthers: boolean;
  designationOptions: string[];
  departmentOptions: string[];
  positions: readonly string[];
  onSupervisor: (value: string) => void;
  onDesignation: (value: string) => void;
  onDepartment: (value: string) => void;
  onPosition: (value: string) => void;
  onDeptInvalid: (invalid: boolean) => void;
  onDepartmentInvalid: (invalid: boolean) => void;
  onPositionInvalid: (invalid: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Your work details</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        These fill in automatically on every form. Every field is optional.
      </p>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="lbl">Supervisor</span>
          <input
            className="inp"
            id="profile-onboarding-supervisor"
            name="supervisor"
            value={form.supervisor}
            placeholder="e.g. Maria Santos"
            disabled={busy}
            onChange={(event) => onSupervisor(event.target.value)}
          />
        </label>
        <OrgSelect
          id="onboarding-designation"
          label="Designation"
          list={designationOptions}
          value={form.area}
          placeholder="e.g. RGC Dipolog Satellite"
          allowOthers={allowOthers}
          onChange={onDesignation}
          onValidityChange={onDeptInvalid}
        />
        <OrgSelect
          id="onboarding-department"
          label="Department"
          list={departmentOptions}
          value={form.department}
          placeholder="e.g. Information Technology"
          allowOthers={allowOthers}
          onChange={onDepartment}
          onValidityChange={onDepartmentInvalid}
        />
        <OrgSelect
          id="onboarding-position"
          label="Position"
          list={positions}
          value={positions.includes(form.designation) ? form.designation : ""}
          placeholder={form.department ? "Pick a position in this department" : "e.g. IT Support"}
          allowOthers={allowOthers}
          onChange={onPosition}
          onValidityChange={onPositionInvalid}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onSkip}
          disabled={busy}
        >
          Skip for now
        </button>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onBack}>
            Back
          </button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={onContinue}>
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

function SignatureStep({
  initial,
  busy,
  onBack,
  onFinish,
  onSkip,
}: {
  initial: string;
  busy: boolean;
  onBack: () => void;
  onFinish: (signature: string) => void;
  onSkip: () => void;
}) {
  const [signature, setSignature] = useState(initial);
  const [padKey, setPadKey] = useState(0);

  function clear() {
    setSignature("");
    setPadKey((key) => key + 1);
  }

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">Add your signature</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        It appears on the forms you file. Only you can change it.
      </p>
      <div className="mt-5">
        <SignatureCanvas key={padKey} disabled={busy} value={signature} onChange={setSignature} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={onSkip}
        >
          Skip for now
        </button>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-outline" disabled={busy} onClick={onBack}>
            Back
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || !signature}
            onClick={clear}
          >
            Clear
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => onFinish(signature)}
          >
            {busy ? "Saving…" : "Finish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SignatureCanvas({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [uploaded, setUploaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || uploaded) return;
    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.25;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a1a";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (value.startsWith("data:image")) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, width, height);
        img.src = value;
      }
    };
    const frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
    // Repaint when entering draw mode, not on every stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploaded]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    onChange("");
    setUploaded(false);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
  }

  function onUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Choose a PNG or JPG of your signature.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setUploaded(true);
      void normalizeSignature(result).then(onChange);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      {uploaded && value ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="flex h-36 w-full items-center justify-center rounded-md border border-border bg-paper"
        >
          <img
            src={value}
            alt="Uploaded signature"
            className="max-h-32 max-w-full object-contain"
          />
        </button>
      ) : (
        <canvas
          ref={canvasRef}
          aria-label="Draw your signature"
          className="h-36 w-full cursor-crosshair rounded-md border border-border bg-paper touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      )}
      <div className="mt-2 flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm text-foreground/80 underline-offset-2 hover:underline"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          Upload an image instead
        </button>
        {value ? (
          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground"
            disabled={disabled}
            onClick={clear}
          >
            Clear
          </button>
        ) : null}
      </div>
      <input
        ref={fileRef}
        type="file"
        id="profile-onboarding-signature-file"
        name="signature-file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function DoneCard({
  given,
  form,
  gaps,
  busy,
  onFinishName,
  onFinishWork,
  onFinishSignature,
  onEnter,
}: {
  given: string;
  form: EmployeeProfile;
  gaps: ReturnType<typeof profileGaps>;
  busy: boolean;
  onFinishName: () => void;
  onFinishWork: () => void;
  onFinishSignature: () => void;
  onEnter: () => void;
}) {
  const complete = !gaps.name && !gaps.work && !gaps.signature;
  const workLine = [
    form.supervisor.trim(),
    [form.department.trim(), form.designation.trim()].filter(Boolean).join(" · "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-7">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {complete ? `You're all set, ${given}` : `Welcome, ${given}`}
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {complete
          ? "Your profile is complete. It fills in automatically on every form you file."
          : "You can finish what's open any time in My account."}
      </p>

      <ul className="mt-5 space-y-3">
        <StatusRow
          done={!gaps.name}
          label="Name"
          detail={gaps.name ? "Skipped" : form.full_name}
          onFinish={gaps.name ? onFinishName : undefined}
        />
        <StatusRow
          done={!gaps.work}
          label="Work details"
          detail={gaps.work ? "Skipped" : workLine || "Added"}
          onFinish={gaps.work ? onFinishWork : undefined}
        />
        <StatusRow
          done={!gaps.signature}
          label="Signature"
          detail={gaps.signature ? "Skipped. Needed on your forms." : "Added"}
          onFinish={gaps.signature ? onFinishSignature : undefined}
        />
      </ul>

      <button
        type="button"
        className="btn btn-primary mt-6 w-full"
        disabled={busy}
        onClick={onEnter}
      >
        Continue
      </button>
    </section>
  );
}

function StatusRow({
  done,
  label,
  detail,
  onFinish,
}: {
  done: boolean;
  label: string;
  detail: string;
  // Callers pass `undefined` explicitly with exactOptionalPropertyTypes on.
  onFinish?: (() => void) | undefined;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
          done ? "bg-success text-success-foreground" : "border border-border text-transparent"
        }`}
        aria-hidden="true"
      >
        <Check className="size-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{detail}</span>
      </span>
      {onFinish ? (
        <button
          type="button"
          className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
          onClick={onFinish}
        >
          Finish
        </button>
      ) : null}
    </li>
  );
}
