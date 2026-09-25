import { APP } from "@/config/app";

export const pageTitle = (title: string) => `${title} — ${APP.name}`;

/** Standard <head> meta for a route. Replaces the copy-pasted meta blocks. */
export function seo({ title, description }: { title: string; description: string }) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  };
}
