// Historical/guarded: the old toast-pool picker this file used to export
// (pickToastPair/resolveToastSeed/parseToastSeed/mulberry32/
// TOAST_AUTO_DISMISS_MS) was retired along with Toasts.svelte — the bell/
// panel/toast system now lives in Notifications.svelte, backed by
// src/lib/notificationStore.ts. Only this one key survives: tests/visual/
// pipeline.mjs (not touched this pass) still imports it to pre-seed a
// sessionStorage value for every golden capture, and removing the export
// would break that import with no way to fix it from here. It is otherwise
// unread by any current code path.
export const TOAST_SEED_STORAGE_KEY = "edith:toast-seed";
