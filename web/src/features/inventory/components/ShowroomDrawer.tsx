/**
 * Showroom view/edit/add drawer.
 *
 * Same right-side panel as the asset drawer: navy banner header, white body
 * with labelled fields grouped into Showroom, CCTV, Internet, Photos and Notes
 * (Notes last), and a footer with Delete on the left, Cancel + orange primary
 * on the right. The status selects read the shared showroom vocabulary, so
 * their labels match the board, the tab counts and the export. The Photos
 * section follows the supplied two-up card mock: label above, upload/picture
 * card, filename + size + underlined Replace/Remove underneath.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Loader2 } from "lucide-react";

import type {
  Showroom,
  ShowroomPhotoSlot,
  ShowroomPhotos,
  ShowroomSaveRequest,
} from "@swiftslip/shared/showrooms";
import {
  SHOWROOM_CCTV_CONNECTION_OPTIONS,
  SHOWROOM_CCTV_INSTALLED_OPTIONS,
  SHOWROOM_INTERNET_OPTIONS,
  SHOWROOM_PHOTO_SLOTS,
} from "@swiftslip/shared/showrooms";

import {
  deleteShowroomPhoto,
  discardStagedShowroomPhoto,
  getShowroomPhotos,
  stageShowroomPhoto,
  uploadShowroomPhoto,
} from "@/api/showrooms.functions";
import {
  makeThumbnail,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_MB,
  prepareAttachment,
} from "@/lib/attachment-upload";
import { fileToBase64 } from "@/lib/file";

import { CANCEL_BUTTON, FIELD, LABEL, SECTION, SECTION_TITLE, SELECT } from "../lib/drawer-styles";
import { isBlank } from "../lib/helpers";
import { buildShowroomPhotoChanges, type PhotoRefDraft } from "../lib/showroom-photo-changes";
import { ShowroomPhotoDialog } from "./ShowroomPhotoDialog";
import { ShowroomPhotoField, type ShowroomPhotoPreview } from "./ShowroomPhotoField";

export type ShowroomDrawerMode = "view" | "edit" | "add";

type ShowroomDrawerProps = {
  isOpen: boolean;
  showroom: Showroom | null;
  mode: ShowroomDrawerMode;
  onClose: () => void;
  onSave: (showroomId: number | null, req: ShowroomSaveRequest) => void | Promise<void>;
  onDelete: (showroom: Showroom) => void;
  /**
   * A photo was attached/removed right away (edit mode), so the board's
   * thumbnail may have changed even though the form was not saved.
   */
  onPhotosChanged?: () => void | Promise<void>;
};

type FormState = {
  name: string;
  cctvInstalled: string;
  cctvConnection: string;
  cctvNote: string;
  internet: string;
  notes: string;
};

/** A picture uploaded before the record exists, with its local preview. */
type PhotoDraft = PhotoRefDraft & {
  previewUrl: string;
};

/** Extension fallback when Windows reports an empty MIME type. */
const PHOTO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

function revokeDraftUrls(drafts: Partial<Record<ShowroomPhotoSlot, PhotoDraft>>) {
  for (const draft of Object.values(drafts)) {
    if (draft) URL.revokeObjectURL(draft.previewUrl);
  }
}

/** Every status starts at the neutral "not recorded" key in add mode. */
const EMPTY_FORM: FormState = {
  name: "",
  cctvInstalled: "not_recorded",
  cctvConnection: "not_recorded",
  cctvNote: "",
  internet: "not_recorded",
  notes: "",
};

/** Shallow equality over the form's string fields (edit-dirty check). */
function isSameForm(a: FormState, b: FormState): boolean {
  const keys = Object.keys(a) as Array<keyof FormState>;
  return keys.every((key) => a[key] === b[key]);
}

export function ShowroomDrawer(props: ShowroomDrawerProps) {
  const { isOpen, showroom, mode, onClose, onSave, onDelete, onPhotosChanged } = props;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Snapshot of the last loaded form, for the edit-dirty check.
  const [baseline, setBaseline] = useState<FormState>(EMPTY_FORM);
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [saving, setSaving] = useState(false);
  // Synchronous guard: `saving` only turns the button off after the next
  // render, which a fast double-click can outrun.
  const savingRef = useRef(false);

  const isAddMode = mode === "add";

  const [photos, setPhotos] = useState<ShowroomPhotos | null>(null);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photoDrafts, setPhotoDrafts] = useState<Partial<Record<ShowroomPhotoSlot, PhotoDraft>>>(
    {},
  );
  const [photoRemovals, setPhotoRemovals] = useState<Set<ShowroomPhotoSlot>>(new Set());
  const [photoBusy, setPhotoBusy] = useState<ShowroomPhotoSlot | null>(null);
  // An already-saved picture is being deleted (edit mode); the card shows
  // "Removing…" and every photo action waits for it.
  const [photoRemoving, setPhotoRemoving] = useState<ShowroomPhotoSlot | null>(null);
  // The upload bar only: climbs to 90 on a timer, then waits for the real
  // upload before the drawer sends 100.
  const [photoProgress, setPhotoProgress] = useState<{
    slot: ShowroomPhotoSlot;
    value: number;
  } | null>(null);
  const progressTick = useRef<number | null>(null);
  const progressFinish = useRef<number | null>(null);
  // The full-size picture being previewed, with the slot label for the caption.
  const [photoPreview, setPhotoPreview] = useState<{
    photo: ShowroomPhotoPreview;
    label: string;
  } | null>(null);
  // Async uploads must read the latest drafts, not the render they started in.
  const draftsRef = useRef<Partial<Record<ShowroomPhotoSlot, PhotoDraft>>>({});
  // Whether the drawer is still open when an upload finally resolves.
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  // Bumped on every open/close/switch. An upload that started in an older
  // generation must never attach itself to what is open now.
  const uploadEpoch = useRef(0);

  // Edit mode saves only what changed: nothing touched, nothing to submit.
  const hasChanges = !isSameForm(form, baseline);
  const hasPhotoChanges = photoRemovals.size > 0 || Object.keys(photoDrafts).length > 0;
  const saveDisabled =
    saving ||
    photoBusy != null ||
    photoRemoving != null ||
    (!isAddMode && !hasChanges && !hasPhotoChanges);

  const upd = useCallback((patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
  }, []);

  const loadForm = useCallback(() => {
    const next: FormState =
      showroom == null
        ? { ...EMPTY_FORM }
        : {
            ...EMPTY_FORM,
            name: showroom.showroom_name,
            cctvInstalled: showroom.cctv_installed,
            cctvConnection: showroom.cctv_connection,
            cctvNote: showroom.cctv_note ?? "",
            internet: showroom.internet,
            notes: showroom.notes ?? "",
          };

    setForm(next);
    setBaseline(next);
  }, [showroom]);

  // Mirrors `OnParametersSet`: reload the form when opened, or when the
  // showroom/mode changes while open.
  const lastLoadRef = useRef<{ showroom: Showroom | null; mode: ShowroomDrawerMode } | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const needsLoad =
        !wasOpenRef.current ||
        lastLoadRef.current == null ||
        lastLoadRef.current.showroom !== showroom ||
        lastLoadRef.current.mode !== mode;
      if (needsLoad) {
        loadForm();
        setShowError(false);
        lastLoadRef.current = { showroom, mode };
      }
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, showroom, mode, loadForm]);

  // Start every open with no drafts, then load the three signed slot URLs.
  const showroomId = showroom?.showroom_id ?? null;
  useEffect(() => {
    // Invalidate uploads from the previous open/record, even when closing.
    uploadEpoch.current += 1;
    if (!isOpen) {
      // The in-flight request can no longer report back, so clear the flag
      // here or a skeleton would outlive the drawer it belonged to.
      setPhotosLoading(false);
      return;
    }

    revokeDraftUrls(draftsRef.current);
    draftsRef.current = {};
    setPhotoDrafts({});
    setPhotoRemovals(new Set());
    setPhotoBusy(null);
    setPhotoRemoving(null);
    setPhotoProgress(null);
    setPhotoPreview(null);
    setPhotos(null);

    if (isAddMode || showroomId == null) {
      setPhotosLoading(false);
      return;
    }

    let cancelled = false;
    setPhotosLoading(true);
    getShowroomPhotos({ showroomId })
      .then((result) => {
        if (!cancelled) setPhotos(result);
      })
      .catch(() => {
        if (!cancelled) setPhotos(null);
      })
      .finally(() => {
        if (!cancelled) setPhotosLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isAddMode, showroomId]);

  // Leaving the drawer for good releases the local previews.
  useEffect(() => () => revokeDraftUrls(draftsRef.current), []);

  /** Cancel/close: discard anything staged that the server has not saved. */
  const discardDraftPhotos = useCallback(() => {
    const drafts = draftsRef.current;
    for (const draft of Object.values(drafts)) {
      if (draft) {
        void discardStagedShowroomPhoto({ ref: draft.ref }).catch(() => {
          // A sweeper clears it after 24 h if this best-effort call fails.
        });
      }
    }
    revokeDraftUrls(drafts);
    draftsRef.current = {};
    setPhotoDrafts({});
    setPhotoRemovals(new Set());
  }, []);

  const cancelChanges = () => {
    discardDraftPhotos();
    onClose();
  };

  // Escape closes the drawer, like the backdrop click. The preview dialog owns
  // Escape while it is open, so the drawer stands down instead of closing too.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || photoPreview) return;
      discardDraftPhotos();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, discardDraftPhotos, photoPreview]);

  const panelRef = useRef<HTMLElement | null>(null);

  // Keep Tab inside the drawer while it is open.
  const trapFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || panelRef.current == null) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (!panelRef.current.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const fail = (message: string) => {
    setShowError(true);
    setErrorMessage(message);
  };

  /** Stop the bar's tick and any pending finish; safe to call repeatedly. */
  const stopPhotoProgress = useCallback(() => {
    if (progressTick.current != null) {
      window.clearInterval(progressTick.current);
      progressTick.current = null;
    }
    if (progressFinish.current != null) {
      window.clearTimeout(progressFinish.current);
      progressFinish.current = null;
    }
  }, []);

  /** Run the bar quickly to 90, then hold until the upload resolves. */
  const startPhotoProgress = (slot: ShowroomPhotoSlot) => {
    stopPhotoProgress();
    setPhotoProgress({ slot, value: 5 });
    progressTick.current = window.setInterval(() => {
      setPhotoProgress((current) => {
        if (!current || current.slot !== slot) return current;
        const remaining = 90 - current.value;
        if (remaining <= 0) return current;
        // Big steps at first, small ones near 90: fast where nothing is
        // measured yet, slow exactly where the wait happens.
        return {
          slot,
          value: Math.min(90, current.value + Math.max(0.8, remaining * 0.25)),
        };
      });
    }, 90);
  };

  useEffect(() => () => stopPhotoProgress(), [stopPhotoProgress]);

  /**
   * Upload one picked image, then make sure it is stored somewhere that
   * survives a refresh:
   *
   * - existing showroom → `POST …/photos/:slot` stores the bytes and the row in
   *   one request;
   * - new showroom → no id exists yet, so the ref waits in a draft and travels
   *   with the create request.
   *
   * Nothing is ever left "staged in the browser but unsaved": that state is
   * exactly what lost a picture (and left the bytes orphaned) before.
   */
  const pickPhoto = async (slot: ShowroomPhotoSlot, file: File) => {
    const looksLikeImage =
      file.type.startsWith("image/") ||
      (!file.type && /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name));
    if (!looksLikeImage) {
      fail("Pick a JPG, PNG, WebP, GIF or BMP image.");
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      fail(`That image is too large. Keep it under ${MAX_ATTACHMENT_MB} MB.`);
      return;
    }

    const epoch = uploadEpoch.current;
    setPhotoBusy(slot);
    setShowError(false);
    startPhotoProgress(slot);
    try {
      // Same pipeline as attachments: shrink a big phone photo in the browser.
      const prepared = await prepareAttachment(file);
      const extension = prepared.name.split(".").pop()?.toLowerCase() ?? "";
      const contentType = prepared.type || PHOTO_MIME[extension] || "";
      if (!contentType) throw new Error("That image type could not be read.");

      const [base64, thumbBase64] = await Promise.all([
        fileToBase64(prepared),
        makeThumbnail(prepared),
      ]);

      if (showroomId != null && !isAddMode) {
        // The user left this showroom while the file was being prepared: do
        // not attach a picture they no longer expect to see.
        if (epoch !== uploadEpoch.current || !isOpenRef.current) return;

        // The showroom exists: one request stores the bytes and writes the row,
        // so a refresh or a crash can no longer lose the picture. The second
        // guard only stops a late answer from overwriting a different
        // showroom's state; the photo itself is already saved either way.
        const fresh = await uploadShowroomPhoto({
          showroomId,
          slot,
          data: {
            filename: prepared.name,
            contentType,
            base64,
            ...(thumbBase64 ? { thumbBase64 } : {}),
          },
        });
        if (epoch === uploadEpoch.current) setPhotos(fresh);
        try {
          await onPhotosChanged?.();
        } catch {
          // The board refetches on its own; the picture is already saved.
        }
      } else {
        // A new showroom has no id yet: stage the bytes and let the create
        // request carry the refs.
        const staged = await stageShowroomPhoto({
          data: {
            filename: prepared.name,
            contentType,
            base64,
            ...(thumbBase64 ? { thumbBase64 } : {}),
          },
        });

        // Closed/reopened/switched while the bytes were in flight: nothing
        // should reference this upload, so drop it now.
        if (epoch !== uploadEpoch.current || !isOpenRef.current) {
          void discardStagedShowroomPhoto({ ref: staged.photoRef }).catch(() => {});
          return;
        }

        // A second pick for the same slot supersedes the first staging upload.
        const previous = draftsRef.current[slot];
        if (previous) {
          URL.revokeObjectURL(previous.previewUrl);
          void discardStagedShowroomPhoto({ ref: previous.ref }).catch(() => {});
        }

        const draft: PhotoDraft = {
          ref: staged.photoRef,
          thumbRef: staged.thumbRef ?? null,
          filename: staged.filename,
          byteSize: staged.byteSize,
          previewUrl: URL.createObjectURL(prepared),
        };
        draftsRef.current = { ...draftsRef.current, [slot]: draft };
        setPhotoDrafts({ ...draftsRef.current });
        setPhotoRemovals((current) => {
          if (!current.has(slot)) return current;
          const next = new Set(current);
          next.delete(slot);
          return next;
        });
      }

      // The picture is stored. Hold 100% for a beat before it replaces the
      // bar, so the upload reads as finished, not vanished.
      stopPhotoProgress();
      setPhotoProgress({ slot, value: 100 });
      await new Promise<void>((resolve) => {
        progressFinish.current = window.setTimeout(resolve, 240);
      });
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not upload that photo.");
    } finally {
      stopPhotoProgress();
      setPhotoBusy(null);
      setPhotoProgress(null);
    }
  };

  /**
   * Remove a picture. An existing showroom's row is deleted immediately (the
   * picture is already saved, so there is nothing to defer); a draft in a new
   * showroom is dropped, and the save request carries the removal.
   */
  const removePhoto = async (slot: ShowroomPhotoSlot) => {
    const draft = draftsRef.current[slot];
    if (draft) {
      URL.revokeObjectURL(draft.previewUrl);
      void discardStagedShowroomPhoto({ ref: draft.ref }).catch(() => {});
      const next = { ...draftsRef.current };
      delete next[slot];
      draftsRef.current = next;
      setPhotoDrafts(next);
      return;
    }

    if (isAddMode || showroomId == null) {
      setPhotoRemovals((current) => new Set(current).add(slot));
      return;
    }

    if (!photos?.[slot]) return;

    setPhotoRemoving(slot);
    setShowError(false);
    try {
      await deleteShowroomPhoto({ showroomId, slot });
      setPhotos((current) => (current ? { ...current, [slot]: null } : current));
      try {
        await onPhotosChanged?.();
      } catch {
        // The board refetches on its own; the picture is already gone.
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not remove that photo.");
    } finally {
      setPhotoRemoving(null);
    }
  };

  const previewFor = (slot: ShowroomPhotoSlot): ShowroomPhotoPreview | null => {
    const draft = photoDrafts[slot];
    if (draft) {
      return { url: draft.previewUrl, filename: draft.filename, byteSize: draft.byteSize };
    }
    if (photoRemovals.has(slot)) return null;
    return photos?.[slot] ?? null;
  };

  const save = async () => {
    // One request at a time: the drawer stays open until the save resolves, so
    // a second click would otherwise fire a duplicate insert.
    if (savingRef.current) return;
    // Edit mode with an untouched form has nothing to submit.
    if (!isAddMode && !hasChanges && !hasPhotoChanges) return;
    if (isBlank(form.name)) {
      fail("Enter a showroom name.");
      return;
    }

    savingRef.current = true;
    setShowError(false);
    setSaving(true);
    try {
      const photos = buildShowroomPhotoChanges(photoDrafts, photoRemovals);

      const request: ShowroomSaveRequest = {
        showroomName: form.name.trim(),
        cctvInstalled: form.cctvInstalled as ShowroomSaveRequest["cctvInstalled"],
        cctvConnection: form.cctvConnection as ShowroomSaveRequest["cctvConnection"],
        cctvNote: isBlank(form.cctvNote) ? null : form.cctvNote.trim(),
        internet: form.internet as ShowroomSaveRequest["internet"],
        notes: isBlank(form.notes) ? null : form.notes.trim(),
        ...(photos ? { photos } : {}),
      };
      await onSave(isAddMode ? null : (showroom?.showroom_id ?? null), request);

      // Saved: the refs are on the row, so only the local previews are freed.
      revokeDraftUrls(draftsRef.current);
      draftsRef.current = {};
      setPhotoDrafts({});
      setPhotoRemovals(new Set());
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  /* ---------------------------------------------------------- render - */

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/50 animate-[fadeIn_.2s_ease-out]"
        onClick={cancelChanges}
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="showroom-drawer-title"
        onKeyDown={trapFocus}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-card text-card-foreground shadow-2xl animate-[slideIn_.22s_ease-out]"
      >
        <header
          className="relative shrink-0 overflow-hidden bg-[var(--inv-navy)] bg-cover bg-center px-5 py-4 text-white"
          style={{ backgroundImage: "url('/inventory/banner.webp')" }}
        >
          <div className="pointer-events-none absolute inset-0 bg-black/35" aria-hidden="true" />
          <div className="relative z-10 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2
                id="showroom-drawer-title"
                className="text-lg font-semibold tracking-tight text-white"
              >
                {isAddMode ? "Add showroom" : "Edit showroom"}
              </h2>
              <p className="mt-0.5 text-xs text-white/75">CCTV and internet status</p>
            </div>
            <button
              type="button"
              className="-mr-2 -mt-2 flex size-10 shrink-0 items-center justify-center rounded-md text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              onClick={cancelChanges}
              aria-label="Close"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-1">
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Showroom</h3>
            <div className="space-y-4">
              <div>
                <label htmlFor="showroom-name" className={LABEL}>
                  Showroom name
                </label>
                <input
                  id="showroom-name"
                  name="showroom-name"
                  type="text"
                  className={FIELD}
                  placeholder="e.g. Roxas"
                  maxLength={120}
                  aria-required="true"
                  value={form.name}
                  onChange={(e) => upd({ name: e.target.value })}
                  autoFocus={isAddMode}
                />
              </div>
            </div>
          </section>

          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>CCTV</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="showroom-cctv-installed" className={LABEL}>
                    CCTV installed
                  </label>
                  <select
                    id="showroom-cctv-installed"
                    name="showroom-cctv-installed"
                    className={SELECT}
                    value={form.cctvInstalled}
                    onChange={(e) => upd({ cctvInstalled: e.target.value })}
                  >
                    {SHOWROOM_CCTV_INSTALLED_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="showroom-cctv-connection" className={LABEL}>
                    CCTV connection
                  </label>
                  <select
                    id="showroom-cctv-connection"
                    name="showroom-cctv-connection"
                    className={SELECT}
                    value={form.cctvConnection}
                    onChange={(e) => upd({ cctvConnection: e.target.value })}
                  >
                    {SHOWROOM_CCTV_CONNECTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="showroom-cctv-note" className={LABEL}>
                  CCTV note
                </label>
                <input
                  id="showroom-cctv-note"
                  name="showroom-cctv-note"
                  type="text"
                  className={FIELD}
                  placeholder="e.g. Temporary, Needs connecting"
                  maxLength={60}
                  value={form.cctvNote}
                  onChange={(e) => upd({ cctvNote: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className={SECTION}>
            {/* The section heading is this control's label: a second "Internet"
                line above the select only repeated it. */}
            <h3 id="showroom-internet-heading" className={SECTION_TITLE}>
              Internet
            </h3>
            <select
              id="showroom-internet"
              name="showroom-internet"
              aria-labelledby="showroom-internet-heading"
              className={SELECT}
              value={form.internet}
              onChange={(e) => upd({ internet: e.target.value })}
            >
              {SHOWROOM_INTERNET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </section>

          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Photos</h3>
            <div className="grid grid-cols-2 gap-4">
              {SHOWROOM_PHOTO_SLOTS.map(({ slot, label }) => (
                <ShowroomPhotoField
                  key={slot}
                  label={`${label} photo`}
                  photo={previewFor(slot)}
                  loading={photosLoading}
                  busy={photoBusy === slot}
                  progress={photoProgress?.slot === slot ? photoProgress.value : null}
                  removing={photoRemoving === slot}
                  disabled={saving || photoRemoving != null}
                  onPick={(file) => void pickPhoto(slot, file)}
                  onRemove={() => void removePhoto(slot)}
                  onPreview={(photo) => setPhotoPreview({ photo, label: `${label} photo` })}
                />
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-4 text-muted-foreground">
              Add a photo of the showroom, the CCTV and the signed acknowledgement form. All are
              optional; the Showroom photo is the board thumbnail.{" "}
              {isAddMode || showroomId == null
                ? "New photos are attached when you add the showroom."
                : "Photos save the moment they finish uploading."}
            </p>
          </section>

          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>Notes</h3>
            <textarea
              id="showroom-notes"
              name="showroom-notes"
              rows={4}
              aria-label="Notes"
              className={`${FIELD} resize-none`}
              placeholder="Add a note…"
              maxLength={4000}
              value={form.notes}
              onChange={(e) => upd({ notes: e.target.value })}
            />
          </section>
        </div>

        <footer className="shrink-0 border-t border-border bg-card">
          {showError ? (
            <p
              role="alert"
              className="mx-5 mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300"
            >
              {errorMessage}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 px-5 py-3.5">
            {isAddMode || showroom == null ? (
              <span />
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-950/40"
                disabled={saving}
                onClick={() => {
                  discardDraftPhotos();
                  if (showroom) onDelete(showroom);
                }}
              >
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 6h18M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6m2 0v13.5A1.5 1.5 0 0 1 16.5 21h-9A1.5 1.5 0 0 1 6 19.5V6h12ZM10 11v6M14 11v6"
                  />
                </svg>
                Delete showroom
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                className={CANCEL_BUTTON}
                onClick={cancelChanges}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg bg-[#c24a0e] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#a83f0b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--inv-navy)] disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => void save()}
                disabled={saveDisabled}
                aria-busy={saving}
                title={
                  !isAddMode && !hasChanges && !hasPhotoChanges ? "No changes to save" : undefined
                }
              >
                {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {saving
                  ? isAddMode
                    ? "Adding…"
                    : "Saving…"
                  : isAddMode
                    ? "Add showroom"
                    : "Save changes"}
              </button>
            </div>
          </div>
        </footer>
      </aside>

      <ShowroomPhotoDialog
        isOpen={photoPreview != null}
        title={isAddMode || showroom == null ? "New showroom" : showroom.showroom_name}
        subtitle={photoPreview?.label}
        src={photoPreview?.photo.url ?? null}
        onClose={() => setPhotoPreview(null)}
      />
    </div>
  );
}
