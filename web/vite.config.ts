import { tanstackRouter } from "@tanstack/router-plugin/vite";
import process from "node:process";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { defineConfig, loadEnv, type UserConfig } from "vite";

/** Where the Express API listens in development (`npm run dev:api`). */
const API_DEV_TARGET = process.env["API_DEV_TARGET"] ?? "http://localhost:9095";

const proxy = {
  // Same-origin in dev and preview, so the session cookie needs no CORS.
  "/api": { target: API_DEV_TARGET, changeOrigin: true },
};

/**
 * Headers the old server entry put on every response (it is gone now), served
 * by `vite preview` — i.e. `npm start`. A real static host must send the same
 * ones: `public/_headers` (Cloudflare Pages / Netlify format) is the copy to keep
 * in sync with this list. Dev gets none: HMR needs inline scripts and a websocket.
 */
const securityHeaders = (apiOrigin: string) => ({
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://*.supabase.co https://ticketing.regasco.ph:2424",
    "font-src 'self' data: https://fonts.gstatic.com",
    `connect-src 'self' https://*.supabase.co${apiOrigin ? ` ${apiOrigin}` : ""}`,
    "worker-src 'self' blob:",
  ].join("; "),
});

export default defineConfig(({ command, mode }) => {
  const isDevBuild = command === "build" && mode === "development";
  // The API lives on its own origin when VITE_API_URL is a full URL.
  const apiUrl = loadEnv(mode, process.cwd(), "VITE_")["VITE_API_URL"] ?? "";
  const apiOrigin = /^https?:\/\//.test(apiUrl) ? new URL(apiUrl).origin : "";

  return {
    ...(isDevBuild
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
          esbuild: { keepNames: true },
        }
      : {}),
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
      ignoreOutdatedRequests: true,
    },
    server: {
      host: "::",
      port: 8080,
      proxy,
      // Wait until writes settle (1s) before restarting the dev server.
      watch: {
        awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
        ignored: ["**/dist/**"],
      },
    },
    preview: { host: "::", port: 8080, proxy, headers: securityHeaders(apiOrigin) },
    plugins: [
      // File-based routes → src/routeTree.gen.ts (generated; committed).
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      react(),
    ],
  } satisfies UserConfig;
});
