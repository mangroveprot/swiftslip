/**
 * The canonical UUID key builder lives in the storage app so every module
 * that stores objects follows the same rule (STORAGE_GUIDE.md §4).
 */
export { storageKey } from '../../storage/utils/key';
