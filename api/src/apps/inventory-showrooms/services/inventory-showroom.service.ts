import type {
  Showroom,
  ShowroomLinkOption,
  ShowroomPhotos,
  ShowroomPhotoChangeInput,
  ShowroomPhotoSlot,
  ShowroomPhotoUploadRequest,
  ShowroomPhotoUrls,
  ShowroomSaveRequest,
  ShowroomStock,
  ShowroomStockRequest,
} from '@swiftslip/shared/showrooms';
import {
  cctvConnectionLabel,
  cctvInstalledLabel,
  internetLabel,
  SHOWROOM_PHOTO_LABELS,
} from '@swiftslip/shared/showrooms';
import type { SessionUser } from '@swiftslip/shared/types';
import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import { ActivityLogService } from '../../activity-log';
import FileStorageService from '../../storage/services/file-storage.service';
import { parseRef } from '../../storage/utils/ref';
import { ShowroomUpdateRepository } from '../../showroom-updates/repositories';
import { InventoryShowroomRepository } from '../repositories';
import type { ShowroomPhotoChange, ShowroomPhotoRow } from '../types';
import InventoryPhotoService, {
  isOwnedStagedRef,
} from './inventory-photo.service';

/** The order the drawer, the API and the docs all use for the three pictures. */
const PHOTO_SLOTS: ShowroomPhotoSlot[] = [
  'showroom',
  'cctv',
  'acknowledge_form',
];

/** Best-effort removal of stored objects; a missing object is not an error. */
async function removeObjects(refs: (string | null)[]): Promise<void> {
  const parsed = refs
    .filter((ref): ref is string => Boolean(ref))
    .map((ref) => parseRef(ref));
  if (parsed.length === 0) return;
  await FileStorageService.removeRefsQuietly(parsed);
}

/**
 * Sign a stored ref, or null when the object/link is not available. With a
 * `downloadName` the link answers as an attachment, so the browser saves it.
 */
async function signQuietly(
  ref: string | null,
  downloadName?: string,
): Promise<string | null> {
  if (!ref) return null;
  try {
    return await FileStorageService.signedUrlRef(ref, downloadName);
  } catch {
    return null;
  }
}

/** "CCTV: Active (Offline) · Internet: Needs request" - the create/delete note. */
function statusSummary(row: {
  cctv_installed: Showroom['cctv_installed'];
  cctv_connection: Showroom['cctv_connection'];
  internet: Showroom['internet'];
}): string {
  const cctv =
    row.cctv_installed === 'active'
      ? `${cctvInstalledLabel(row.cctv_installed)} (${cctvConnectionLabel(row.cctv_connection)})`
      : cctvInstalledLabel(row.cctv_installed);
  return `CCTV: ${cctv} · Internet: ${internetLabel(row.internet)}`;
}

/**
 * Only the fields that actually moved, so an edit reads as an audit line
 * ("CCTV connection: Offline → Online") instead of a dump of the whole row.
 */
function describeChanges(before: Showroom, after: ShowroomSaveRequest): string {
  const parts: string[] = [];

  if (before.showroom_name !== after.showroomName) {
    parts.push(`Renamed from "${before.showroom_name}"`);
  }
  if (before.cctv_installed !== after.cctvInstalled) {
    parts.push(
      `CCTV installed: ${cctvInstalledLabel(before.cctv_installed)} → ${cctvInstalledLabel(after.cctvInstalled)}`,
    );
  }
  if (before.cctv_connection !== after.cctvConnection) {
    parts.push(
      `CCTV connection: ${cctvConnectionLabel(before.cctv_connection)} → ${cctvConnectionLabel(after.cctvConnection)}`,
    );
  }

  const beforeCctvNote = before.cctv_note?.trim() ?? '';
  const afterCctvNote = after.cctvNote?.trim() ?? '';
  if (beforeCctvNote !== afterCctvNote) {
    parts.push(
      afterCctvNote ? `CCTV note: "${afterCctvNote}"` : 'CCTV note cleared',
    );
  }

  if (before.internet !== after.internet) {
    parts.push(
      `Internet: ${internetLabel(before.internet)} → ${internetLabel(after.internet)}`,
    );
  }

  const beforeNotes = before.notes?.trim() ?? '';
  const afterNotes = after.notes?.trim() ?? '';
  if (beforeNotes !== afterNotes) {
    parts.push(afterNotes ? 'Notes updated' : 'Notes cleared');
  }

  return parts.join(' · ');
}

class InventoryShowroomService {
  private readonly repository = new InventoryShowroomRepository();
  /**
   * The Summary of SR Status and Updates owns the status / action-required
   * columns; this service only reads the row a showroom follows.
   */
  private readonly updates = new ShowroomUpdateRepository();

  /**
   * Signed links for one stored picture row. A picture that cannot be signed
   * is null rather than a broken link in an `<img>`.
   */
  private async signedPhotoUrls(
    row: Pick<
      ShowroomPhotoRow,
      'photo_ref' | 'thumb_ref' | 'original_name' | 'byte_size'
    >,
    slot: ShowroomPhotoSlot,
  ): Promise<ShowroomPhotoUrls | null> {
    // The download link carries the original filename as an attachment; if
    // signing it fails the plain link is still a usable fallback.
    const [url, thumbUrl, downloadUrl] = await Promise.all([
      signQuietly(row.photo_ref),
      signQuietly(row.thumb_ref),
      signQuietly(
        row.photo_ref,
        row.original_name?.trim() || `${slot}-photo.jpg`,
      ),
    ]);
    return url
      ? {
          url,
          thumbUrl: thumbUrl ?? url,
          downloadUrl: downloadUrl ?? url,
          filename: row.original_name,
          byteSize: row.byte_size,
        }
      : null;
  }

  /**
   * Every showroom plus its board thumbnail: one signed URL for the Showroom
   * slot, minted here so the list never carries a stored URL (they expire).
   * The other two pictures are fetched only when the drawer opens.
   *
   * A linked showroom also carries the Summary row it follows, so Status and
   * Action required are printed from the Summary and never copied into this
   * table.
   */
  async list(): Promise<ServiceResponse<Showroom>> {
    try {
      const rows = await this.repository.findAll();
      const links = await this.updates.findLinksByIds(
        rows
          .map((row) => row.linked_update_id)
          .filter((id): id is number => id != null),
      );
      const byId = new Map(links.map((link) => [link.update_id, link]));
      const documents = await Promise.all(
        rows.map(async ({ photo_thumb_ref, ...row }) => ({
          ...row,
          link:
            row.linked_update_id == null
              ? null
              : (byId.get(row.linked_update_id) ?? null),
          photo_thumb: await signQuietly(photo_thumb_ref),
        })),
      );
      return { success: true, documents };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /**
   * The drawer's "Linked SwiftSlip showroom" picker: every Summary row, with
   * the inventory showroom already following it (null when the row is free).
   */
  async linkOptions(): Promise<ServiceResponse<ShowroomLinkOption>> {
    try {
      const [updates, links] = await Promise.all([
        this.updates.findAll(),
        this.repository.findLinks(),
      ]);
      const linkedTo = new Map(
        links.map((link) => [link.linked_update_id, link]),
      );
      const documents: ShowroomLinkOption[] = updates.map((row) => {
        const taken = linkedTo.get(row.update_id);
        return {
          update_id: row.update_id,
          showroom_name: row.showroom_name,
          location: row.location,
          status: row.status,
          action_required: row.action_required,
          map_url: row.map_url,
          linked_to: taken?.showroom_name ?? null,
          linked_to_id: taken?.showroom_id ?? null,
        };
      });
      return { success: true, documents };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /**
   * Turn the save's photo section into row changes. Only staged refs owned by
   * this account are accepted, and a ref already attached to a showroom cannot
   * be attached again (one object, one row; otherwise removing one picture
   * would break the other).
   */
  private async photoChanges(
    photos: ShowroomSaveRequest['photos'],
    before: ShowroomPhotoRow[],
    actorId: string,
  ): Promise<ShowroomPhotoChange[]> {
    if (!photos) return [];
    const current = new Map(before.map((row) => [row.slot, row]));
    const changes: ShowroomPhotoChange[] = [];

    const usedRows = await this.repository.allPhotoRefs();
    const used = new Set<string>();
    for (const row of usedRows) {
      for (const ref of [row.photo_ref, row.thumb_ref]) {
        if (!ref) continue;
        const parsed = parseRef(ref);
        used.add(`${parsed.backend}:${parsed.key}`);
      }
    }

    for (const slot of PHOTO_SLOTS) {
      const value = photos[slot];
      if (value === undefined) continue;
      if (value === null) {
        // Only a slot that actually has a row is worth a change (and an audit
        // line); removing an already-empty slot is a no-op.
        if (current.has(slot)) {
          changes.push({
            slot,
            photoRef: null,
            thumbRef: null,
            filename: null,
            byteSize: null,
          });
        }
        continue;
      }
      // Same object already on the row: nothing to write.
      if (current.get(slot)?.photo_ref === value.ref) continue;
      if (
        !isOwnedStagedRef(value.ref, actorId) ||
        (value.thumbRef != null && !isOwnedStagedRef(value.thumbRef, actorId))
      ) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'That photo upload has expired. Pick the photo again.',
        );
      }
      const parsed = parseRef(value.ref);
      if (used.has(`${parsed.backend}:${parsed.key}`)) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'That photo is already attached to another showroom.',
        );
      }
      changes.push({
        slot,
        photoRef: value.ref,
        thumbRef: value.thumbRef ?? null,
        filename: value.filename?.trim() || null,
        byteSize: value.byteSize ?? null,
      });
    }
    return changes;
  }

  /** "CCTV photo added · Acknowledge Form photo replaced" for the audit line. */
  private describePhotoChanges(
    changes: ShowroomPhotoChange[],
    before: ShowroomPhotoRow[],
  ): string {
    return changes
      .map((change) => {
        const label = SHOWROOM_PHOTO_LABELS[change.slot];
        if (change.photoRef === null) return `${label} photo removed`;
        const hadOne = before.some((row) => row.slot === change.slot);
        return `${label} photo ${hadOne ? 'replaced' : 'added'}`;
      })
      .join(' · ');
  }

  /** Create (`showroomId` null) or update one showroom. */
  async save(
    actor: SessionUser,
    showroomId: number | null,
    input: ShowroomSaveRequest,
  ): Promise<ServiceResponse<{ showroomId: number }>> {
    try {
      // The DB index is the real guard; this pre-check exists so the owner
      // reads "That showroom already exists." instead of driver noise.
      if (
        await this.repository.nameExists(
          input.showroomName,
          showroomId ?? undefined,
        )
      ) {
        throw new ErrorResponse(
          'UNIQUE_FIELD_ERROR',
          'That showroom already exists.',
        );
      }

      const before =
        showroomId == null ? null : await this.repository.findById(showroomId);

      // A link always points at a row that exists right now: the picker is fed
      // from the Summary board, so a stale id means the row was deleted.
      const linkTarget =
        input.linkedUpdateId == null
          ? null
          : await this.updates.findById(input.linkedUpdateId);
      if (input.linkedUpdateId != null && linkTarget == null) {
        throw new ErrorResponse(
          'NOT_FOUND_ERROR',
          'That showroom is no longer on the SwiftSlip Summary.',
        );
      }

      const beforePhotos =
        showroomId == null ? [] : await this.repository.findPhotos(showroomId);

      // `photos` never reaches the showroom columns; it is split out first.
      const { photos, ...fields } = input;
      const photoChanges = await this.photoChanges(
        photos,
        beforePhotos,
        actor.id,
      );
      const saved = await this.repository.save(
        showroomId,
        fields,
        photoChanges,
      );

      // The DB now points at the new refs; the superseded objects can go.
      for (const change of photoChanges) {
        const old = beforePhotos.find((row) => row.slot === change.slot);
        if (old && old.photo_ref !== change.photoRef) {
          await removeObjects([old.photo_ref, old.thumb_ref]);
        }
      }

      const photoDetail = this.describePhotoChanges(photoChanges, beforePhotos);
      const fieldDetail = before
        ? describeChanges(before, input)
        : statusSummary({
            cctv_installed: input.cctvInstalled,
            cctv_connection: input.cctvConnection,
            internet: input.internet,
          });
      const linkDetail =
        (before?.linked_update_id ?? null) === input.linkedUpdateId
          ? ''
          : input.linkedUpdateId == null
            ? 'Unlinked from SwiftSlip'
            : `Linked to ${linkTarget?.showroom_name ?? 'SwiftSlip'}`;
      const detail =
        [fieldDetail, photoDetail, linkDetail].filter(Boolean).join(' · ') ||
        'No changes';

      await ActivityLogService.logBy(actor, {
        action: before == null ? 'showroom.created' : 'showroom.updated',
        target: input.showroomName,
        detail,
      });

      return { success: true, document: { showroomId: saved } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async remove(
    actor: SessionUser,
    showroomId: number,
  ): Promise<ServiceResponse<{ deleted: number }>> {
    try {
      const before = await this.repository.findById(showroomId);
      const photos = await this.repository.findPhotos(showroomId);
      const deleted = await this.repository.remove(showroomId);
      if (deleted === 0 || before == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
      }
      // The FK cascaded the picture rows away; the objects are ours to remove.
      await removeObjects(
        photos.flatMap((row) => [row.photo_ref, row.thumb_ref]),
      );
      await ActivityLogService.logBy(actor, {
        action: 'showroom.deleted',
        target: before.showroom_name,
        detail: statusSummary(before),
      });
      return { success: true, document: { deleted } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /**
   * Signed links for the three slots, fetched when the drawer opens. A slot
   * with no row is null; a picture that cannot be signed is treated the same
   * way rather than handed to an `<img>` as a broken link.
   */
  async getPhotos(
    showroomId: number,
  ): Promise<ServiceResponse<ShowroomPhotos>> {
    try {
      const showroom = await this.repository.findById(showroomId);
      if (showroom == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
      }
      const rows = await this.repository.findPhotos(showroomId);
      const bySlot = new Map(rows.map((row) => [row.slot, row]));
      const document = {} as ShowroomPhotos;

      for (const slot of PHOTO_SLOTS) {
        const row = bySlot.get(slot);
        document[slot] = row ? await this.signedPhotoUrls(row, slot) : null;
      }

      return { success: true, document };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /**
   * Store one picked picture and attach it to an existing showroom **in one
   * request**. The bytes and the row are written by the same call, so a
   * refresh (or a closed tab) can never leave an upload in storage with no
   * photo on the record — the gap the old stage-then-save flow had.
   *
   * A new showroom has no id yet, so its pictures still stage separately and
   * ride the create request; cancelling that discards them.
   */
  async uploadPhoto(
    actor: SessionUser,
    showroomId: number,
    slot: ShowroomPhotoSlot,
    input: ShowroomPhotoUploadRequest,
  ): Promise<ServiceResponse<ShowroomPhotos>> {
    try {
      const showroom = await this.repository.findById(showroomId);
      if (showroom == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
      }

      const staged = await InventoryPhotoService.stage(actor, input);
      if (!staged.success) throw staged.error;
      const stored = staged.document;
      if (!stored) {
        throw new ErrorResponse(
          'INTERNAL_SERVER_ERROR',
          'The photo upload did not complete.',
        );
      }
      const { photoRef, thumbRef, filename, byteSize } = stored;

      const attached = await this.attachPhoto(actor, showroom, slot, {
        ref: photoRef,
        thumbRef,
        filename,
        byteSize,
      });
      if (!attached.success) {
        // The bytes exist but no row points at them: drop them now instead of
        // waiting for the 24 h staging sweep.
        await InventoryPhotoService.discard(actor, photoRef);
        throw attached.error;
      }
      return attached;
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** Attach refs that are already stored (the write half of `uploadPhoto`). */
  private async attachPhoto(
    actor: SessionUser,
    showroom: Showroom,
    slot: ShowroomPhotoSlot,
    input: ShowroomPhotoChangeInput,
  ): Promise<ServiceResponse<ShowroomPhotos>> {
    try {
      const showroomId = showroom.showroom_id;
      const before =
        (await this.repository.findPhotos(showroomId)).find(
          (row) => row.slot === slot,
        ) ?? null;

      // Retry / double submit: the row already points at this object, so the
      // call is a read, not a write (and it re-mints the signed links).
      if (before?.photo_ref === input.ref) {
        return await this.getPhotos(showroomId);
      }

      if (
        !isOwnedStagedRef(input.ref, actor.id) ||
        (input.thumbRef != null && !isOwnedStagedRef(input.thumbRef, actor.id))
      ) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'That photo upload has expired. Pick the photo again.',
        );
      }

      // One object, one slot: attaching the same upload twice would make one
      // Remove delete the other picture's bytes.
      const { backend, key } = parseRef(input.ref);
      const used = (await this.repository.allPhotoRefs()).some((row) =>
        [row.photo_ref, row.thumb_ref].some((value) => {
          if (!value) return false;
          const parsed = parseRef(value);
          return parsed.backend === backend && parsed.key === key;
        }),
      );
      if (used) {
        throw new ErrorResponse(
          'BAD_REQUEST',
          'That photo is already attached to another showroom.',
        );
      }

      const change: ShowroomPhotoChange = {
        slot,
        photoRef: input.ref,
        thumbRef: input.thumbRef ?? null,
        filename: input.filename?.trim() || null,
        byteSize: input.byteSize ?? null,
      };
      await this.repository.setPhoto(showroomId, change);

      // The row now points at the new object; the superseded one can go.
      if (before && before.photo_ref !== change.photoRef) {
        await removeObjects([before.photo_ref, before.thumb_ref]);
      }

      await ActivityLogService.logBy(actor, {
        action: 'showroom.updated',
        target: showroom.showroom_name,
        detail: `${SHOWROOM_PHOTO_LABELS[slot]} photo ${before ? 'replaced' : 'added'}`,
      });

      // Fresh links for all three slots, so the drawer can replace its state
      // wholesale and the next open is identical to this one.
      return await this.getPhotos(showroomId);
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** Remove one picture (the drawer's "Remove"): the row goes, then the object. */
  async deletePhoto(
    actor: SessionUser,
    showroomId: number,
    slot: ShowroomPhotoSlot,
  ): Promise<ServiceResponse<{ deleted: number }>> {
    try {
      const before = await this.repository.findById(showroomId);
      if (before == null) {
        throw new ErrorResponse('NOT_FOUND_ERROR', 'Showroom not found.');
      }
      const row = (await this.repository.findPhotos(showroomId)).find(
        (photo) => photo.slot === slot,
      );
      const deleted = await this.repository.removePhoto(showroomId, slot);
      if (row) {
        await removeObjects([row.photo_ref, row.thumb_ref]);
        await ActivityLogService.logBy(actor, {
          action: 'showroom.updated',
          target: before.showroom_name,
          detail: `${SHOWROOM_PHOTO_LABELS[slot]} photo removed`,
        });
      }
      return { success: true, document: { deleted } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  /** The one editable number in the header card: total CCTV units. */
  async getStock(): Promise<ServiceResponse<ShowroomStock>> {
    try {
      const cctvTotalUnits = await this.repository.getCctvTotalUnits();
      return { success: true, document: { cctvTotalUnits } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  async saveStock(
    actor: SessionUser,
    input: ShowroomStockRequest,
  ): Promise<ServiceResponse<ShowroomStock>> {
    try {
      const before = await this.repository.getCctvTotalUnits();
      const cctvTotalUnits = await this.repository.setCctvTotalUnits(
        input.cctvTotalUnits,
      );
      await ActivityLogService.logBy(actor, {
        action: 'showroom.stock_updated',
        target: 'CCTV units',
        detail:
          before === cctvTotalUnits
            ? `Stayed at ${cctvTotalUnits} units`
            : `${before} → ${cctvTotalUnits} units`,
      });
      return { success: true, document: { cctvTotalUnits } };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }
}

export default new InventoryShowroomService();
