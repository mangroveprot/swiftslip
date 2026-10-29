import {
  RETENTION_FORM_TYPES,
  type RetentionFormType,
} from '@swiftslip/shared/schemas';
import { readOtherFiles } from '../../attachments/utils/other-files';
import { OTHER_FILES_TABLES } from '../types';

/**
 * The selection rules of a cleanup run, kept pure and free of Supabase so they
 * can be checked against sample rows without touching a database. Everything
 * here answers one question: may this row be deleted?
 */

const KNOWN_TYPES = new Set<string>(RETENTION_FORM_TYPES);

/** The saved `form_types` list, junk entries and repeats dropped. */
export function readFormTypes(raw: unknown): RetentionFormType[] {
  if (!Array.isArray(raw)) return [];
  const known = raw.filter(
    (value): value is RetentionFormType =>
      typeof value === 'string' && KNOWN_TYPES.has(value),
  );
  // Deduped: a repeated type would otherwise be walked (and counted) twice.
  return [...new Set(known)];
}

/** A per-type count map from jsonb — unknown keys dropped, non-numbers skipped. */
export function readCountMap(
  raw: unknown,
): Partial<Record<RetentionFormType, number>> {
  const out: Partial<Record<RetentionFormType, number>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const type of RETENTION_FORM_TYPES) {
    const value = (raw as Record<string, unknown>)[type];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      out[type] = Math.floor(value);
    }
  }
  return out;
}

export const sumCounts = (map: Partial<Record<RetentionFormType, number>>) =>
  Object.values(map).reduce((sum, count) => sum + (count ?? 0), 0);

/** Everything created before this instant is older than the retention window. */
export const cutoffFor = (days: number, now: number = Date.now()) =>
  new Date(now - days * 86_400_000).toISOString();

/**
 * The fields the "may this be deleted?" test reads. Deliberately a structural
 * subset of a form row: the cleanup selects exactly these, and a list can pass
 * its own row without pretending to be an `ExpiredRow`.
 */
export type RuleFields = {
  attachment_path?: string | null;
  attachment_approved?: boolean;
  /** Non-DTR forms. */
  employee_name?: string;
  date_filed?: string;
  /** DTR only. */
  name?: string;
  emp_no?: string;
};

/**
 * Untouched scaffolds — a form someone opened and never filled — are the
 * app's own `quiet` sweep to remove, not the cleanup's. The empty shape is
 * different per family: DTR has name/emp_no, the others name/date_filed.
 */
export function isScaffold(type: RetentionFormType, row: RuleFields): boolean {
  if (type === 'dtr') return !row.name && !row.emp_no;
  return !row.employee_name && !row.date_filed;
}

/**
 * Is this old form "finished", i.e. safe to delete? Owner's rule of
 * 2026-10-29: approved, or nothing ever attached to approve.
 *
 * • DTR has no approval state at all (migration 0009: "certified, not
 *   approved"), so age alone decides.
 * • OB / LOA / COS / OT carry `attachment_approved`. A slip that was uploaded
 *   but never approved is treated as PENDING and kept forever; a form that
 *   never had a slip has nothing pending, so it goes with its age.
 */
export function isFinished(type: RetentionFormType, row: RuleFields): boolean {
  if (isScaffold(type, row)) return false;
  if (type === 'dtr') return true;
  return row.attachment_approved === true || !row.attachment_path;
}

/** Every storage path the row owns: the main slip plus LOA/OT extras. */
export function pathsOf(
  type: RetentionFormType,
  row: RuleFields & { other_attachments?: unknown },
): string[] {
  const paths: string[] = [];
  if (row.attachment_path) paths.push(row.attachment_path);
  if (OTHER_FILES_TABLES.includes(type)) {
    paths.push(
      ...readOtherFiles(row.other_attachments).map((file) => file.path),
    );
  }
  return paths;
}
