// notifications.yaml (chrome) + src/features/notifications/content/*.md (pool)
import notificationsRaw from "../content/notifications.yaml?raw";
import { parseYaml } from "../../../common/lib/yaml";
import type { CollectionEntry } from "astro:content";
import type { NotificationPoolEntry, NotificationsChrome, NotificationsData } from "../../../common/lib/data";

/** Builds the pool from the `notifications` content collection, sorted by frontmatter `order`, since the seeded per-visit pick depends on stable array position across rebuilds. */
export const buildNotificationPool = (
  entries: CollectionEntry<"notifications">[],
): NotificationPoolEntry[] =>
  entries
    .slice()
    .sort((a, b) => a.data.order - b.data.order)
    .map((e) => ({ id: e.id, sev: e.data.sev, title: e.data.title, body: (e.body ?? "").trim(), src: e.data.src }));

export const buildNotifications = (entries: CollectionEntry<"notifications">[]): NotificationsData => {
  const { ui } = parseYaml<NotificationsChrome>(notificationsRaw, "notifications.yaml");
  return { ui, pool: buildNotificationPool(entries) };
};
