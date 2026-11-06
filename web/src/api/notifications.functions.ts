/**
 * The bell's two calls live in `hr.functions.ts` beside the HR approval calls
 * they belong to; this file is kept as the named entry point the spec asks for
 * (`web/src/api/notifications.functions.ts`) and re-exports nothing else.
 */
export { listNotifications, markNotificationsRead, type NotificationFeed } from "./hr.functions";
