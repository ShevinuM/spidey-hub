# Phase 06 — notifications

> **Status: planned, not started. Blocked on phase 05.** Binding decisions: `Instructions/00-phases.md`.

## Context

`src/features/notifications`. Out-of-context wiring: project entries, legacy fallout — **`common/tests/ui/support/` fixtures import `NOTIFICATIONS_INJECT_SEED_STORAGE_KEY`/`TOAST_DURATION_SCALE_STORAGE_KEY` from `notificationStore.ts`**; update in the same change. `content.config.ts` pointer for `content/notifications`; `notifications.yaml` per D17.

## Objective

Bell/panel/toast system migrated verbatim and green (3 specs, 30 content docs); the legacy `notifications.ts` remnant either proven-unused and deleted, or ported.

## Background — move table

| v1 | v2 |
|---|---|
| `src/components/notifications/*` (`Notifications.svelte`, `NotificationBell.svelte`, `NotificationsPanel.svelte`, `ToastStack.svelte`, `notificationsState.svelte.ts`) | `src/features/notifications/components/` |
| `src/lib/notificationStore.ts` | `src/features/notifications/lib/notification-store.ts` (D15) |
| `src/lib/notifications.ts` (legacy remnant) | grep consumers: zero → delete in step 2 (recorded in Results); any → port alongside |
| `src/content/notifications/` (30 docs — one file per record stays, files-and-naming R013), `src/data/notifications.yaml` | `src/features/notifications/content/` |
| specs `notifications, notifications-boot, toast-drain-arm`; unit `notificationStore.test.ts` | `tests/ui/e2e/`; `tests/unit/` |
| notifications-mapped goldens (incl. `21-notifications-panel-open`) | `tests/ui/visual/goldens/<viewport>/` |

## Steps

- [ ] **1–5.** The per-feature loop per `Instructions/03-profile/PLAN.md`, with this table; D21 reused verbatim; support-fixture import updates in step 2.

## Acceptance criteria

Loop verified; verifier PASS + auditor clean on `src/features/notifications` (D23); commit per 00-phases.md. Stop: no toast-timing/seed-logic changes (specs compute expected values from `mulberry32`/`pickRandomUnseen` — single source of truth preserved via imports, not duplicated constants).

## Results

(executor fills in)
