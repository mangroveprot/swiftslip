/**
 * The one way the web app talks to the backend.
 *
 * - Base URL: `VITE_API_URL` (e.g. `https://api.example.com/api`), else `/api`
 *   (the Vite dev proxy forwards that to the Express API on :9095).
 * - Sends the session cookie (`credentials: "include"`).
 * - Reads the API envelope `{ success, document | documents, … }`; failures
 *   (`{ success: false, error }`, or no answer at all) throw an `ApiError`
 *   whose `.message` is safe to show to the user.
 */

const BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) || "/api").replace(
  /\/+$/,
  "",
);

/**
 * Called once when a request that needs a session comes back 401 (cookie
 * expired, account removed, password changed on another device). The router
 * registers it; sign-in / session / sign-out are exempt because a 401 there is
 * an expected answer, not an expired session.
 */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};
const SESSION_FREE_PATHS = new Set(["/auth/sign-in", "/auth/sign-out", "/auth/session"]);

type ErrorBody = { status?: number; code?: string; message?: string; suggestions?: string[] };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly suggestions: string[];

  constructor(status: number, code: string, message: string, suggestions: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.suggestions = suggestions;
  }
}

/** The success envelope. `T` is the shape of `document` (or one item of `documents`). */
export type Envelope<T> = {
  success: true;
  document?: T;
  documents?: T[];
  total?: number;
  results?: number;
  page?: number;
  limit?: number;
};

type Query = Record<string, string | number | boolean | undefined | null>;
type RequestOptions = { body?: unknown; query?: Query | undefined };
type Body = { success?: boolean; error?: ErrorBody };

function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

async function request<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options: RequestOptions = {},
): Promise<Envelope<T>> {
  const init: RequestInit = { method, credentials: "include" };
  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${BASE}${withQuery(path, options.query)}`, init);
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Could not reach the server. Check your connection.");
  }

  let json = null as Body | null;
  try {
    json = (await response.json()) as Body;
  } catch {
    json = null;
  }

  if (!response.ok || !json || json.success === false) {
    const error = json?.error;
    if (response.status === 401 && !SESSION_FREE_PATHS.has(path)) onUnauthorized?.();
    throw new ApiError(
      error?.status ?? response.status,
      error?.code ?? "INTERNAL_SERVER_ERROR",
      error?.message || "Something went wrong. Please try again.",
      error?.suggestions,
    );
  }
  return json as Envelope<T>;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T>(path: string, query?: Query) => request<T>("DELETE", path, { query }),
};

/** `document` of a success envelope; throws if the API answered without one. */
export function documentOf<T>(envelope: Envelope<T>): T {
  if (envelope.document === undefined) {
    throw new ApiError(500, "INTERNAL_SERVER_ERROR", "The server sent an empty answer.");
  }
  return envelope.document;
}

/** `documents` of a success envelope (empty list when absent). */
export function documentsOf<T>(envelope: Envelope<T>): T[] {
  return envelope.documents ?? [];
}

/** Ids go into URL paths — always encode them. */
export const seg = (value: string | number) => encodeURIComponent(String(value));
