// Shared resume-download action — PLAN.md Phase 5C item 5C.2 ("`:resume` /
// `:cv` (same action as Profile's r — resume download)"). Factored out of
// Profile.svelte so the site-wide cmdline (Terminal.svelte) can trigger the
// exact same action from any view, not just from inside the mounted
// Profile component — single source of behavior, no duplicated
// window.open call. The literal path is an asset URL, not user-visible
// copy, same convention as Profile.svelte's own hardcoded image src paths
// (see that file's header comment for why those live outside content).
const RESUME_HREF = "/assets/resume.pdf";

export function downloadResume(): void {
  window.open(RESUME_HREF, "_blank");
}
