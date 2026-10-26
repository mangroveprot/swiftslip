import { APP } from "@/config/app";

export const pageTitle = (title: string) => `${title} | ${APP.name}`;

/** Absolute URL of the shared preview image — crawlers reject relative paths. */
export const ogImage = `${APP.siteUrl}${APP.logoPath}`;

/** Standard <head> meta for a route. Replaces the copy-pasted meta blocks. */
export function seo({ title, description }: { title: string; description: string }) {
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:image", content: ogImage },
      { property: "og:image:alt", content: APP.name },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: ogImage },
    ],
  };
}
