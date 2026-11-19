import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

/** The parsed search object every route carries, validated or not. */
type Search = Record<string, unknown>;

/**
 * Keep one piece of page state in the address bar.
 *
 * A route only survives a refresh because its URL says where it is. The same
 * holds for the sub-view inside a page: a selected tab, section or roster
 * filter. Storing it in component state alone sends a reload back to the
 * default view, so this hook reads and writes it as a search param instead.
 *
 * Values outside `values` (a hand-edited URL, a stale link) fall back to
 * `fallback` rather than rendering an unknown screen. Writing the fallback
 * removes the param, so a default view keeps a clean `/admin`, and every
 * update replaces the current history entry: moving between tabs is not a
 * new page, so Back still leaves the screen instead of walking the tabs.
 */
export function useUrlState<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): readonly [T, (next: T) => void] {
  const search = useSearch({ strict: false }) as Search;
  const raw = search[key];
  const value = (
    typeof raw === "string" && (values as readonly string[]).includes(raw) ? (raw as T) : fallback
  ) as T;

  const navigate = useNavigate();

  const setValue = useCallback(
    (next: T) => {
      void navigate({
        to: ".",
        replace: true,
        // The router types the updater against every registered route's search;
        // this hook deliberately runs on whichever route rendered it, so the
        // updater keeps the current object and changes only its own key.
        search: ((previous: Search) => {
          const search: Search = { ...previous };
          if (next === fallback) delete search[key];
          else search[key] = next;
          return search;
        }) as never,
      });
    },
    [fallback, key, navigate],
  );

  return [value, setValue] as const;
}
