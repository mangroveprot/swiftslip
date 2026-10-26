import { Link } from "@tanstack/react-router";
import { FileQuestion } from "lucide-react";

/**
 * Shown when an editor's row cannot be read — most often because the form was
 * deleted (or the URL is a stale bookmark) and the id no longer names anything.
 *
 * Without this the editor fell through to `EditorSkeleton`, so a permanently
 * missing row looked like a page that was still loading, forever. On a hard
 * load the same failure surfaced as the router's generic "This page didn't
 * load" crash screen, which told the user nothing about what to do next.
 *
 * `backTo` is the route of the list this form belongs to, so the user has one
 * obvious way out instead of the browser back button.
 */
export function FormUnavailable({ backTo, label }: { backTo: string; label: string }) {
  return (
    <main className="flex min-h-full items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-xl border bg-card text-muted-foreground shadow-sm">
          <FileQuestion className="size-6" aria-hidden="true" />
        </span>

        <h1 className="mt-4 text-xl font-semibold tracking-tight text-foreground">
          This form is no longer available
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          It may have been deleted, or the link may be out of date. Anything you had already saved
          is not affected.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to={backTo} className="btn btn-primary">
            Back to {label}
          </Link>
          <Link to="/" className="btn btn-outline">
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
